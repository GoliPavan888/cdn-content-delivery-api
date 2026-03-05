require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  storage: {
    type: process.env.STORAGE_TYPE || 'minio',
    endpoint: process.env.STORAGE_ENDPOINT,
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    bucket: process.env.STORAGE_BUCKET || 'assets',
  },
  cdn: {
    purgeEnabled: process.env.CDN_PURGE_ENABLED === 'true',
    provider: process.env.CDN_PROVIDER,
    apiKey: process.env.CDN_API_KEY,
    zoneId: process.env.CDN_ZONE_ID,
  },
  token: {
    expirySeconds: parseInt(process.env.TOKEN_EXPIRY_SECONDS || '3600', 10),
    length: parseInt(process.env.TOKEN_LENGTH || '32', 10),
  },
  originShield: {
    enabled: process.env.ORIGIN_SHIELD_ENABLED === 'true',
    allowedIps: (process.env.ALLOWED_CDN_IPS || '').split(',').filter(Boolean),
  },
};
