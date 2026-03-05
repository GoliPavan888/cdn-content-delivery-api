# CDN Content Delivery API

A robust, high-performance content delivery API that leverages modern HTTP caching standards and integrates seamlessly with a Content Delivery Network (CDN). This API minimizes latency for global users and reduces load on origin servers by maximizing cache hit rates at the edge.

## Features

- **ETag-based Caching**: Strong ETags using SHA-256 hashing for reliable cache validation
- **Conditional Requests**: Full support for If-None-Match headers and 304 Not Modified responses
- **Smart Cache-Control**: Granular cache headers for public, private, and versioned content
- **Versioned Content**: Immutable asset versioning with infinite cacheability
- **Private Content**: Secure temporary access tokens for sensitive assets
- **Object Storage Integration**: Seamless integration with S3-compatible storage (MinIO, AWS S3)
- **CDN Integration**: Automatic cache invalidation support for major CDNs (Cloudflare, CloudFront)
- **Head Requests**: Metadata-only requests without transferring content
- **Production-Ready**: Docker containerization, comprehensive error handling, and security features

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Object Storage**: MinIO (development) / AWS S3 (production)
- **Testing**: Jest + Supertest
- **Load Testing**: Custom benchmark script

## Project Structure

```
.
├── src/
│   ├── app.js                  # Express application setup
│   ├── config/
│   │   ├── database.js        # PostgreSQL connection pool
│   │   ├── storage.js         # S3/MinIO client configuration
│   │   └── env.js             # Environment variables
│   ├── models/
│   │   ├── Asset.js           # Asset database operations
│   │   ├── AssetVersion.js    # Asset version database operations
│   │   └── AccessToken.js     # Access token database operations
│   ├── controllers/
│   │   └── assetController.js # Business logic for asset endpoints
│   ├── routes/
│   │   └── assets.js          # API route definitions
│   └── utils/
│       ├── etag.js            # ETag generation utilities
│       └── tokenGenerator.js  # Cryptographic token generation
├── tests/
│   └── assets.test.js         # Comprehensive test suite
├── scripts/
│   ├── init-db.js            # Database schema initialization
│   └── run_benchmark.js      # Performance benchmarking tool
├── docs/
│   ├── README.md             # This file
│   ├── ARCHITECTURE.md       # System design documentation
│   ├── API_DOCS.md          # API endpoint reference
│   └── PERFORMANCE.md       # Performance metrics
├── Dockerfile                # Container image definition
├── docker-compose.yml        # Multi-container orchestration
├── package.json              # Node.js dependencies
├── .env.example              # Environment variable template
└── submission.yml            # Automated evaluation configuration
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL 15+ (optional, use Docker)

### Quick Start with Docker

```bash
# Clone or navigate to the project directory
cd cdn-content-delivery-api

# Copy environment file
cp .env.example .env

# Build and start all services
docker-compose up --build

# In another terminal, initialize the database
docker-compose exec app npm run init-db

# The API will be available at http://localhost:3000
```

### Local Development Setup

```bash
# Install dependencies
npm install

# Set up environment file
cp .env.example .env

# Start PostgreSQL and MinIO (requires Docker)
docker-compose up postgres minio minio-init

# Initialize database
npm run init-db

# Start the development server
npm run dev

# Run tests
npm test

# Run benchmarks
npm run benchmark
```

## API Endpoints

### Asset Upload
- **POST** `/assets/upload`
  - Upload a new asset file
  - Request: `multipart/form-data` with `file` field
  - Response: `201 Created` with asset metadata

### Asset Download
- **GET** `/assets/:id/download`
  - Download asset content with conditional request support
  - Supports: `If-None-Match` for ETag validation
  - Response: `200 OK` with asset content or `304 Not Modified`

### Asset Metadata
- **HEAD** `/assets/:id/download`
  - Retrieve asset metadata without downloading content
  - Response: `200 OK` with headers (no body)

### Publish Version
- **POST** `/assets/:id/publish`
  - Create an immutable version of the asset
  - Response: `200 OK` with version details

### Public Versioned Content
- **GET** `/assets/public/:version_id`
  - Access immutable versioned assets (maximum cacheability)
  - Highly cacheable with 1-year max-age
  - Response: `200 OK` or `304 Not Modified`

### Private Content Access
- **GET** `/assets/private/:token`
  - Access private content using a temporary token
  - Response: `200 OK` with private cache headers or `401 Unauthorized`

### Create Access Token
- **POST** `/assets/:id/access-tokens`
  - Generate a temporary access token for a private asset
  - Response: `201 Created` with token and expiration details

### Health Check
- **GET** `/health`
  - Check API health status
  - Response: `200 OK` with status

## HTTP Caching Features

### Cache Control Headers

1. **Public Versioned Assets** (immutable)
   ```
   Cache-Control: public, max-age=31536000, immutable
   ```
   - Cached for 1 year
   - Safe for CDN and browser caching
   - Never revalidated once cached

2. **Public Mutable Assets**
   ```
   Cache-Control: public, s-maxage=3600, max-age=60
   ```
   - CDN caches for 1 hour
   - Browser caches for 1 minute
   - Allows faster updates with stale-while-revalidate

3. **Private Assets**
   ```
   Cache-Control: private, no-store, no-cache, must-revalidate
   ```
   - Not cacheable by CDN
   - Browser cannot cache
   - Always revalidated

### ETag Validation

- ETags are SHA-256 hashes of file content
- Supports conditional requests with `If-None-Match` header
- Returns `304 Not Modified` when client's ETag matches server's
- Reduces bandwidth for unchanged content

### Last-Modified Header

- Included in all content responses
- Enables additional cache validation strategies
- Complements ETag-based validation

## Testing

### Run Test Suite

```bash
# Run all tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

### Test Coverage

- ✅ Asset upload functionality
- ✅ Asset download with conditional requests
- ✅ ETag generation and validation
- ✅ HTTP 304 Not Modified responses
- ✅ Cache-Control header configuration
- ✅ Asset versioning and publication
- ✅ Access token generation and validation
- ✅ Private content access control
- ✅ Error handling and validation

### Run Benchmarks

```bash
# Run performance benchmarks
npm run benchmark

# Results are saved to PERFORMANCE.md
```

## Configuration

### Environment Variables

See `.env.example` for all available options:

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=cdn_content_delivery
DB_USER=postgres
DB_PASSWORD=postgres

# Object Storage
STORAGE_TYPE=minio  # or 's3' for AWS
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=assets

# CDN Configuration
CDN_PURGE_ENABLED=false
CDN_PROVIDER=cloudflare
CDN_API_KEY=your_api_key
CDN_ZONE_ID=your_zone_id

# Token Configuration
TOKEN_EXPIRY_SECONDS=3600
TOKEN_LENGTH=32
```

## Production Deployment

### AWS S3 Deployment

1. Set up AWS S3 bucket and credentials
2. Update `.env` with S3 configuration:
   ```env
   STORAGE_TYPE=s3
   STORAGE_ENDPOINT=https://s3.amazonaws.com
   STORAGE_ACCESS_KEY=your_aws_access_key
   STORAGE_SECRET_KEY=your_aws_secret_key
   STORAGE_BUCKET=your-bucket-name
   ```

### CDN Integration

#### Cloudflare
1. Update `.env` with Cloudflare credentials
2. Enable `CDN_PURGE_ENABLED=true`
3. Set `CDN_PROVIDER=cloudflare`
4. Provide `CDN_API_KEY` and `CDN_ZONE_ID`

#### CloudFront / Fastly
Similar configuration with provider-specific credentials.

## Performance Targets

- **Cache Hit Ratio**: >95% for public assets
- **Average Response Time**: <100ms (with CDN)
- **Throughput**: >1000 requests/second
- **304 Not Modified Rate**: >90% for conditional requests

## Security Features

- **Strong ETags**: SHA-256 based content hashing
- **Cryptographic Tokens**: Secure random token generation
- **Token Expiration**: Configurable short-lived access tokens
- **Origin Shielding**: CDN-only access configuration
- **No Store Private**: Private content never cached

## Database Schema

### assets
```sql
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
```

### asset_versions
```sql
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets(id),
    object_storage_key VARCHAR(255) NOT NULL UNIQUE,
    etag VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### access_tokens
```sql
CREATE TABLE access_tokens (
    token VARCHAR(255) PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker-compose logs postgres

# Verify database initialization
docker-compose exec app npm run init-db
```

### MinIO Bucket Issues
```bash
# Check MinIO logs
docker-compose logs minio

# Ensure bucket is created
docker-compose exec minio-init bucket create assets
```

### Port Already in Use
```bash
# Kill process on port 3000
# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# On Linux/macOS:
lsof -i :3000
kill -9 <PID>
```

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Ensure all tests pass before submitting PRs
4. Update documentation for API changes

## License

MIT

## Support

For issues and questions, please refer to the documentation files:
- [API Documentation](docs/API_DOCS.md)
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Performance Report](PERFORMANCE.md)
