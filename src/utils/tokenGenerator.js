const crypto = require('crypto');
const config = require('../config/env');

/**
 * Generate a cryptographically secure random token
 */
function generateToken(length = config.token.length) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Calculate expiration timestamp
 */
function getExpirationTime(secondsFromNow = config.token.expirySeconds) {
  return new Date(Date.now() + secondsFromNow * 1000);
}

module.exports = {
  generateToken,
  getExpirationTime,
};
