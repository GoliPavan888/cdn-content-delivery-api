const crypto = require('crypto');

/**
 * Simple in-memory cache for demonstration
 * In production, use Redis or similar
 */
class CacheStore {
  constructor(ttl = 3600) {
    this.cache = new Map();
    this.ttl = ttl * 1000; // Convert to milliseconds
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key, value, ttl = this.ttl) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

const cacheStore = new CacheStore();

/**
 * Cache middleware for GET requests
 */
function cacheMiddleware(req, res, next) {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Generate cache key from URL
  const cacheKey = crypto.createHash('md5').update(req.originalUrl).digest('hex');

  // Check cache
  const cached = cacheStore.get(cacheKey);
  if (cached) {
    // Set X-Cache header to indicate cache hit
    res.set('X-Cache', 'HIT');
    res.set('X-Cache-Key', cacheKey);
    
    // Restore headers from cache
    Object.entries(cached.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    // Set status and send body
    return res.status(cached.status).send(cached.body);
  }

  // Cache miss
  res.set('X-Cache', 'MISS');
  res.set('X-Cache-Key', cacheKey);

  // Intercept response to cache it
  const originalSend = res.send;
  res.send = function (body) {
    // Only cache successful responses
    if (res.statusCode === 200) {
      const cacheableHeaders = {};
      ['content-type', 'etag', 'content-length', 'cache-control', 'last-modified'].forEach(header => {
        const value = res.get(header);
        if (value) cacheableHeaders[header] = value;
      });

      cacheStore.set(cacheKey, {
        status: res.statusCode,
        headers: cacheableHeaders,
        body: body,
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

module.exports = {
  cacheMiddleware,
  cacheStore,
};
