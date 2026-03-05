const crypto = require('crypto');

/**
 * Generate a strong ETag from file content
 * Uses SHA-256 hash of the content
 */
function generateETag(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf-8');
  }
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `"${hash}"`;
}

/**
 * Generate ETag from stream
 */
async function generateETagFromStream(stream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`"${hash.digest('hex')}"`));
    stream.on('error', reject);
  });
}

module.exports = {
  generateETag,
  generateETagFromStream,
};
