const pool = require('../config/database');

class AccessToken {
  /**
   * Create a new access token
   */
  static async create({
    token,
    assetId,
    expiresAt,
  }) {
    const query = `
      INSERT INTO access_tokens (token, asset_id, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [token, assetId, expiresAt];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Get token details
   */
  static async findByToken(token) {
    const query = 'SELECT * FROM access_tokens WHERE token = $1;';
    const result = await pool.query(query, [token]);
    return result.rows[0];
  }

  /**
   * Check if token is valid (not expired)
   */
  static async isValid(token) {
    const query = `
      SELECT * FROM access_tokens
      WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP;
    `;
    const result = await pool.query(query, [token]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all valid tokens for an asset
   */
  static async findValidByAssetId(assetId) {
    const query = `
      SELECT * FROM access_tokens
      WHERE asset_id = $1 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [assetId]);
    return result.rows;
  }

  /**
   * Revoke a token (delete it)
   */
  static async revoke(token) {
    const query = 'DELETE FROM access_tokens WHERE token = $1 RETURNING *;';
    const result = await pool.query(query, [token]);
    return result.rows[0];
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpired() {
    const query = 'DELETE FROM access_tokens WHERE expires_at < CURRENT_TIMESTAMP;';
    const result = await pool.query(query);
    return result.rowCount;
  }
}

module.exports = AccessToken;
