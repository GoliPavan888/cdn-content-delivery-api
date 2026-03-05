const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class AssetVersion {
  /**
   * Create a new asset version
   */
  static async create({
    assetId,
    objectStorageKey,
    etag,
  }) {
    const id = uuidv4();
    const query = `
      INSERT INTO asset_versions (id, asset_id, object_storage_key, etag)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [id, assetId, objectStorageKey, etag];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get version by ID
   */
  static async findById(id) {
    const query = 'SELECT * FROM asset_versions WHERE id = $1;';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Get versions for an asset
   */
  static async findByAssetId(assetId) {
    const query = `
      SELECT * FROM asset_versions
      WHERE asset_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [assetId]);
    return result.rows;
  }

  /**
   * Get latest version of an asset
   */
  static async getLatestVersion(assetId) {
    const query = `
      SELECT * FROM asset_versions
      WHERE asset_id = $1
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const result = await pool.query(query, [assetId]);
    return result.rows[0];
  }

  /**
   * Delete version
   */
  static async deleteById(id) {
    const query = 'DELETE FROM asset_versions WHERE id = $1 RETURNING *;';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = AssetVersion;
