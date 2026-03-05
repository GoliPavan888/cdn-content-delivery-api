const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Asset {
  /**
   * Create a new asset in the database
   */
  static async create({
    objectStorageKey,
    filename,
    mimeType,
    sizeBytes,
    etag,
    isPrivate = false,
  }) {
    const id = uuidv4();
    const query = `
      INSERT INTO assets (id, object_storage_key, filename, mime_type, size_bytes, etag, is_private)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [id, objectStorageKey, filename, mimeType, sizeBytes, etag, isPrivate];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get asset by ID
   */
  static async findById(id) {
    const query = 'SELECT * FROM assets WHERE id = $1;';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Get asset by object storage key
   */
  static async findByKey(key) {
    const query = 'SELECT * FROM assets WHERE object_storage_key = $1;';
    const result = await pool.query(query, [key]);
    return result.rows[0];
  }

  /**
   * Update current version ID
   */
  static async updateCurrentVersion(id, versionId) {
    const query = `
      UPDATE assets
      SET current_version_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [versionId, id]);
    return result.rows[0];
  }

  /**
   * Update asset (e.g., update etag for mutable assets)
   */
  static async update(id, updates) {
    const allowedFields = ['object_storage_key', 'filename', 'mime_type', 'size_bytes', 'etag'];
    const keys = Object.keys(updates).filter((k) => allowedFields.includes(k));

    if (keys.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    const values = [...keys.map((k) => updates[k]), id];
    const query = `
      UPDATE assets
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${keys.length + 1}
      RETURNING *;
    `;
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * List all assets
   */
  static async list(limit = 100, offset = 0) {
    const query = 'SELECT * FROM assets ORDER BY created_at DESC LIMIT $1 OFFSET $2;';
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
  }

  /**
   * Delete asset by ID
   */
  static async deleteById(id) {
    const query = 'DELETE FROM assets WHERE id = $1 RETURNING *;';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = Asset;
