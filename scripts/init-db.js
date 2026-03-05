const pool = require('../src/config/database');

const schema = `
-- Drop existing tables if they exist
DROP TABLE IF EXISTS access_tokens CASCADE;
DROP TABLE IF EXISTS asset_versions CASCADE;
DROP TABLE IF EXISTS assets CASCADE;

-- Create assets table
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

-- Create asset_versions table
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    object_storage_key VARCHAR(255) NOT NULL UNIQUE,
    etag VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create access_tokens table
CREATE TABLE access_tokens (
    token VARCHAR(255) PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_assets_is_private ON assets(is_private);
CREATE INDEX idx_asset_versions_asset_id ON asset_versions(asset_id);
CREATE INDEX idx_access_tokens_asset_id ON access_tokens(asset_id);
CREATE INDEX idx_access_tokens_expires_at ON access_tokens(expires_at);
`;

async function initDb() {
  const client = await pool.connect();
  try {
    console.log('Initializing database schema...');
    await client.query(schema);
    console.log('Database schema initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

initDb()
  .then(() => {
    console.log('Database initialization complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
