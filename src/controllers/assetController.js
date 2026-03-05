const Asset = require('../models/Asset');
const AssetVersion = require('../models/AssetVersion');
const AccessToken = require('../models/AccessToken');
const s3Client = require('../config/storage');
const config = require('../config/env');
const { generateETag } = require('../utils/etag');
const { generateToken, getExpirationTime } = require('../utils/tokenGenerator');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Check if error is due to invalid UUID format
 */
function isInvalidUuidError(error) {
  return error.code === '22P02'; // PostgreSQL invalid UUID error
}

/**
 * Set appropriate cache control headers based on asset type
 */
function setCacheHeaders(res, assetType = 'public-mutable') {
  const headers = {
    'public-immutable': 'public, max-age=31536000, immutable',
    'public-mutable': 'public, s-maxage=3600, max-age=60',
    'private': 'private, no-store, no-cache, must-revalidate',
  };
  res.set('Cache-Control', headers[assetType] || headers['public-mutable']);
}

/**
 * POST /assets/upload
 * Upload a new asset
 */
async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const filename = originalname;
    const isPrivate = req.body.isPrivate === 'true';
    const etag = generateETag(buffer);
    const storageKey = `assets/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${filename}`;

    // Upload to object storage
    const uploadParams = {
      Bucket: config.storage.bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimetype,
    };

    await s3Client.upload(uploadParams).promise();

    // Create asset in database
    const asset = await Asset.create({
      objectStorageKey: storageKey,
      filename,
      mimeType: mimetype,
      sizeBytes: size,
      etag,
      isPrivate,
    });

    res.status(201).json({
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mime_type,
      size: asset.size_bytes,
      etag: asset.etag,
      isPrivate: asset.is_private,
      createdAt: asset.created_at,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
}

/**
 * HEAD /assets/:id/download
 * Get asset headers without body
 */
async function headDownload(req, res) {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    setCacheHeaders(res, asset.is_private ? 'private' : 'public-mutable');
    res.set({
      'Content-Type': asset.mime_type,
      'Content-Length': asset.size_bytes,
      'ETag': asset.etag,
      'Last-Modified': new Date(asset.updated_at).toUTCString(),
    });

    res.status(200).end();
  } catch (error) {
    console.error('HEAD download error:', error);
    if (isInvalidUuidError(error)) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.status(500).json({ error: 'Failed to retrieve asset headers' });
  }
}

/**
 * GET /assets/:id/download
 * Download asset with conditional request support (If-None-Match)
 */
async function download(req, res) {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Check If-None-Match (conditional request)
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === asset.etag) {
      res.set({
        'ETag': asset.etag,
        'Last-Modified': new Date(asset.updated_at).toUTCString(),
      });
      return res.status(304).end();
    }

    // Fetch from object storage
    const getParams = {
      Bucket: config.storage.bucket,
      Key: asset.object_storage_key,
    };

    const data = await s3Client.getObject(getParams).promise();

    setCacheHeaders(res, asset.is_private ? 'private' : 'public-mutable');
    res.set({
      'Content-Type': asset.mime_type,
      'Content-Length': data.ContentLength,
      'ETag': asset.etag,
      'Last-Modified': new Date(asset.updated_at).toUTCString(),
    });

    res.send(data.Body);
  } catch (error) {
    console.error('Download error:', error);
    if (isInvalidUuidError(error)) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.status(500).json({ error: 'Failed to download asset' });
  }
}

/**
 * POST /assets/:id/publish
 * Create a new immutable version of the asset
 */
async function publish(req, res) {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Create a new version with same content but new storage key
    const versionStorageKey = `versions/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${asset.filename}`;

    // Copy file to new key
    const copyParams = {
      Bucket: config.storage.bucket,
      CopySource: `${config.storage.bucket}/${asset.object_storage_key}`,
      Key: versionStorageKey,
    };
    await s3Client.copyObject(copyParams).promise();

    // Create version record
    const version = await AssetVersion.create({
      assetId: asset.id,
      objectStorageKey: versionStorageKey,
      etag: asset.etag,
    });

    // Update asset's current version
    await Asset.updateCurrentVersion(asset.id, version.id);

    // Trigger CDN invalidation for mutable asset
    if (config.cdn.purgeEnabled && config.cdn.provider === 'cloudflare') {
      await invalidateCDN(`/assets/${asset.id}/download`);
    }

    res.status(200).json({
      id: asset.id,
      versionId: version.id,
      filename: asset.filename,
      mimeType: asset.mime_type,
      size: asset.size_bytes,
      etag: asset.etag,
      publishedAt: version.created_at,
    });
  } catch (error) {
    console.error('Publish error:', error);
    if (isInvalidUuidError(error)) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.status(500).json({ error: 'Failed to publish asset version' });
  }
}

/**
 * GET /assets/public/:version_id
 * Serve immutable versioned asset (highly cacheable)
 */
async function getPublicVersion(req, res) {
  try {
    const version = await AssetVersion.findById(req.params.version_id);

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const asset = await Asset.findById(version.asset_id);

    // Check If-None-Match
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === version.etag) {
      res.set({
        'ETag': version.etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      return res.status(304).end();
    }

    // Fetch from object storage
    const getParams = {
      Bucket: config.storage.bucket,
      Key: version.object_storage_key,
    };

    const data = await s3Client.getObject(getParams).promise();

    res.set({
      'Content-Type': asset.mime_type,
      'Content-Length': data.ContentLength,
      'ETag': version.etag,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Last-Modified': new Date(version.created_at).toUTCString(),
    });

    res.send(data.Body);
  } catch (error) {
    console.error('Get public version error:', error);
    if (isInvalidUuidError(error)) {
      return res.status(404).json({ error: 'Version not found' });
    }
    res.status(500).json({ error: 'Failed to retrieve asset version' });
  }
}

/**
 * POST /assets/:id/access-tokens
 * Create a temporary access token for private content
 */
async function createAccessToken(req, res) {
  try {
    const asset = await Asset.findById(req.params.id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (!asset.is_private) {
      return res.status(400).json({ error: 'Access tokens are only for private assets' });
    }

    const token = generateToken();
    const expiresAt = getExpirationTime();

    const accessToken = await AccessToken.create({
      token,
      assetId: asset.id,
      expiresAt,
    });

    res.status(201).json({
      token: accessToken.token,
      assetId: accessToken.asset_id,
      expiresAt: accessToken.expires_at,
      expiresIn: config.token.expirySeconds,
    });
  } catch (error) {
    console.error('Create token error:', error);
    res.status(500).json({ error: 'Failed to create access token' });
  }
}

/**
 * GET /assets/private/:token
 * Serve private content with token validation
 */
async function getPrivateContent(req, res) {
  try {
    const accessToken = await AccessToken.isValid(req.params.token);

    if (!accessToken) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const asset = await Asset.findById(accessToken.asset_id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Check If-None-Match
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === asset.etag) {
      res.set({
        'ETag': asset.etag,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      });
      return res.status(304).end();
    }

    // Fetch from object storage
    const getParams = {
      Bucket: config.storage.bucket,
      Key: asset.object_storage_key,
    };

    const data = await s3Client.getObject(getParams).promise();

    res.set({
      'Content-Type': asset.mime_type,
      'Content-Length': data.ContentLength,
      'ETag': asset.etag,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'Last-Modified': new Date(asset.updated_at).toUTCString(),
    });

    res.send(data.Body);
  } catch (error) {
    console.error('Get private content error:', error);
    res.status(500).json({ error: 'Failed to retrieve private asset' });
  }
}

/**
 * Invalidate CDN cache for a URL
 */
async function invalidateCDN(url) {
  if (!config.cdn.purgeEnabled) {
    return;
  }

  try {
    if (config.cdn.provider === 'cloudflare') {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${config.cdn.zoneId}/purge_cache`,
        { files: [url] },
        { headers: { 'X-Auth-Key': config.cdn.apiKey } }
      );
    }
  } catch (error) {
    console.error('CDN invalidation error:', error);
    // Don't fail the request if CDN invalidation fails
  }
}

module.exports = {
  upload,
  download,
  headDownload,
  publish,
  getPublicVersion,
  createAccessToken,
  getPrivateContent,
};
