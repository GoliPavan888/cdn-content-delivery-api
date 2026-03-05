const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/database');
const Asset = require('../src/models/Asset');
const AssetVersion = require('../src/models/AssetVersion');
const AccessToken = require('../src/models/AccessToken');
const { generateToken, getExpirationTime } = require('../src/utils/tokenGenerator');

// Mock S3 client
jest.mock('../src/config/storage', () => ({
  upload: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({ Key: 'test-key' }),
  })),
  getObject: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({
      Body: Buffer.from('test content'),
      ContentLength: 12,
    }),
  })),
  copyObject: jest.fn(() => ({
    promise: jest.fn().mockResolvedValue({}),
  })),
}));

// Setup: Initialize database before tests
beforeAll(async () => {
  await pool.query(`
    DROP TABLE IF EXISTS access_tokens CASCADE;
    DROP TABLE IF EXISTS asset_versions CASCADE;
    DROP TABLE IF EXISTS assets CASCADE;

    CREATE TABLE assets (
      id UUID PRIMARY KEY,
      object_storage_key VARCHAR(255) NOT NULL UNIQUE,
      filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes BIGINT NOT NULL,
      etag VARCHAR(255) NOT NULL,
      current_version_id UUID,
      is_private BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE asset_versions (
      id UUID PRIMARY KEY,
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      object_storage_key VARCHAR(255) NOT NULL UNIQUE,
      etag VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE access_tokens (
      token VARCHAR(255) PRIMARY KEY,
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
});

// Cleanup: Remove all data after each test
afterEach(async () => {
  await pool.query('DELETE FROM access_tokens;');
  await pool.query('DELETE FROM asset_versions;');
  await pool.query('DELETE FROM assets;');
});

// Cleanup: Close database after all tests
afterAll(async () => {
  await pool.end();
});

describe('Asset Upload', () => {
  test('should upload a file successfully', async () => {
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('test content'), 'test.txt')
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('etag');
    expect(response.body.filename).toBe('test.txt');
    expect(response.body.mimeType).toBe('text/plain');
  });

  test('should fail without file', async () => {
    const response = await request(app)
      .post('/assets/upload')
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  test('should mark asset as private if specified', async () => {
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('private content'), 'private.txt')
      .field('isPrivate', 'true')
      .expect(201);

    expect(response.body.isPrivate).toBe(true);
  });
});

describe('Asset Download', () => {
  let assetId;
  let assetEtag;

  beforeEach(async () => {
    // Create test asset
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('download test content'), 'download.txt')
      .expect(201);

    assetId = response.body.id;
    assetEtag = response.body.etag;
  });

  test('should download asset successfully', async () => {
    const response = await request(app)
      .get(`/assets/${assetId}/download`)
      .expect(200);

    expect(response.headers['content-type']).toBeDefined();
    expect(response.headers['etag']).toBe(assetEtag);
    expect(response.headers['cache-control']).toContain('public');
  });

  test('should return 304 Not Modified for matching ETag', async () => {
    const response = await request(app)
      .get(`/assets/${assetId}/download`)
      .set('If-None-Match', assetEtag)
      .expect(304);

    expect(response.text).toBe('');
    expect(response.headers['etag']).toBe(assetEtag);
  });

  test('should return 200 for non-matching ETag', async () => {
    const response = await request(app)
      .get(`/assets/${assetId}/download`)
      .set('If-None-Match', '"different-etag"')
      .expect(200);

    expect(response.headers['etag']).toBe(assetEtag);
  });

  test('should return 404 for non-existent asset', async () => {
    const response = await request(app)
      .get('/assets/non-existent-id/download')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });
});

describe('HEAD Request', () => {
  let assetId;
  let assetEtag;

  beforeEach(async () => {
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('head test content'), 'head.txt')
      .expect(201);

    assetId = response.body.id;
    assetEtag = response.body.etag;
  });

  test('should return headers without body', async () => {
    const response = await request(app)
      .head(`/assets/${assetId}/download`)
      .expect(200);

    expect(response.headers['etag']).toBe(assetEtag);
    expect(response.headers['content-type']).toBeDefined();
    // HEAD responses have no body, so text is undefined
    expect(response.text).toBeUndefined();
  });
});

describe('Cache Control Headers', () => {
  let publicAssetId;
  let privateAssetId;

  beforeEach(async () => {
    const publicResponse = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('public content'), 'public.txt')
      .expect(201);
    publicAssetId = publicResponse.body.id;

    const privateResponse = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('private content'), 'private.txt')
      .field('isPrivate', 'true')
      .expect(201);
    privateAssetId = privateResponse.body.id;
  });

  test('should set public cache headers for public assets', async () => {
    const response = await request(app)
      .get(`/assets/${publicAssetId}/download`)
      .expect(200);

    const cacheControl = response.headers['cache-control'];
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('s-maxage');
  });

  test('should set private cache headers for private assets', async () => {
    const response = await request(app)
      .get(`/assets/${privateAssetId}/download`)
      .expect(200);

    const cacheControl = response.headers['cache-control'];
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
  });
});

describe('Asset Versioning', () => {
  let assetId;

  beforeEach(async () => {
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('version test'), 'version.txt')
      .expect(201);

    assetId = response.body.id;
  });

  test('should publish a new version', async () => {
    const response = await request(app)
      .post(`/assets/${assetId}/publish`)
      .expect(200);

    expect(response.body).toHaveProperty('versionId');
    expect(response.body.id).toBe(assetId);
  });

  test('should return 404 for non-existent asset publish', async () => {
    const response = await request(app)
      .post('/assets/non-existent/publish')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });
});

describe('Public Versioned Assets', () => {
  let versionId;

  beforeEach(async () => {
    const uploadResponse = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('public version test'), 'pubver.txt')
      .expect(201);

    const publishResponse = await request(app)
      .post(`/assets/${uploadResponse.body.id}/publish`)
      .expect(200);

    versionId = publishResponse.body.versionId;
  });

  test('should serve public versioned asset with immutable cache header', async () => {
    const response = await request(app)
      .get(`/assets/public/${versionId}`)
      .expect(200);

    expect(response.headers['etag']).toBeDefined();
    const cacheControl = response.headers['cache-control'];
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age=31536000');
    expect(cacheControl).toContain('immutable');
  });

  test('should return 304 for matching ETag on versioned asset', async () => {
    const getResponse = await request(app)
      .get(`/assets/public/${versionId}`)
      .expect(200);

    const etag = getResponse.headers['etag'];

    const conditionalResponse = await request(app)
      .get(`/assets/public/${versionId}`)
      .set('If-None-Match', etag)
      .expect(304);

    expect(conditionalResponse.text).toBe('');
  });

  test('should return 404 for non-existent version', async () => {
    const response = await request(app)
      .get('/assets/public/non-existent-version')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });
});

describe('Access Tokens', () => {
  let privateAssetId;

  beforeEach(async () => {
    const response = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('secret content'), 'secret.txt')
      .field('isPrivate', 'true')
      .expect(201);

    privateAssetId = response.body.id;
  });

  test('should create access token for private asset', async () => {
    const response = await request(app)
      .post(`/assets/${privateAssetId}/access-tokens`)
      .expect(201);

    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('expiresAt');
    expect(response.body.assetId).toBe(privateAssetId);
  });

  test('should fail to create token for public asset', async () => {
    const uploadResponse = await request(app)
      .post('/assets/upload')
      .attach('file', Buffer.from('public'), 'public.txt')
      .expect(201);

    const response = await request(app)
      .post(`/assets/${uploadResponse.body.id}/access-tokens`)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  test('should access private content with valid token', async () => {
    const tokenResponse = await request(app)
      .post(`/assets/${privateAssetId}/access-tokens`)
      .expect(201);

    const token = tokenResponse.body.token;

    const response = await request(app)
      .get(`/assets/private/${token}`)
      .expect(200);

    expect(response.headers['cache-control']).toContain('private');
  });

  test('should reject private content with invalid token', async () => {
    const response = await request(app)
      .get('/assets/private/invalid-token')
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});

describe('Health Check', () => {
  test('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body.status).toBe('ok');
  });
});
