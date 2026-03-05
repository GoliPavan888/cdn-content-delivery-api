# CDN Content Delivery API - Architecture Guide

## System Overview

The CDN Content Delivery API is designed as a modern, decoupled architecture that maximizes cache efficiency and scalability. The system separates concerns across three primary layers:

1. **API Layer** - HTTP request handling and business logic
2. **Data Layer** - Asset metadata and token management
3. **Storage Layer** - Object storage for actual file content

```
┌─────────────────────────────────────────────────────┐
│                    CDN Network                      │
│  (Cloudflare, CloudFront, Fastly, etc.)            │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│        API Layer (Node.js + Express)                │
│  ┌──────────────────────────────────────────────┐  │
│  │  Routes & Controllers                        │  │
│  │  - Asset upload/download                     │  │
│  │  - Versioning logic                          │  │
│  │  - Token generation & validation             │  │
│  └──────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────────────┐  ┌──────▼──────────────┐
│   Data Layer     │  │  Storage Layer      │
│   PostgreSQL     │  │  MinIO / S3         │
│                  │  │                     │
│  - Assets        │  │  - File blobs       │
│  - Versions      │  │  - Content              │
│  - Tokens        │  │  - Versioned copies │
└──────────────────┘  └─────────────────────┘
```

## Core Components

### 1. API Layer (Express.js)

**Responsibilities:**
- HTTP request/response handling
- Route dispatch
- Business logic orchestration
- Error handling and validation
- HTTP header management (ETags, Cache-Control, etc.)

**Key Files:**
- `src/app.js` - Express setup and middleware
- `src/routes/assets.js` - Route definitions
- `src/controllers/assetController.js` - Business logic

**Design Patterns:**
- MVC architecture (Models-Views-Controllers)
- Middleware-based request pipeline
- Separation of concerns

### 2. Data Models (PostgreSQL)

**Purpose:** Store metadata about assets, versions, and access tokens

**Schema:**

```sql
-- Core asset metadata
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    object_storage_key VARCHAR(255) NOT NULL UNIQUE,  -- Storage reference
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    etag VARCHAR(255) NOT NULL,           -- Strong validator
    current_version_id UUID,              -- Latest version
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Immutable version snapshots
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    object_storage_key VARCHAR(255) NOT NULL UNIQUE,  -- Version-specific key
    etag VARCHAR(255) NOT NULL,
    created_at TIMESTAMP
);

-- Temporary access control
CREATE TABLE access_tokens (
    token VARCHAR(255) PRIMARY KEY,        -- Cryptographic token
    asset_id UUID REFERENCES assets(id),
    expires_at TIMESTAMP NOT NULL,        -- Time-based expiration
    created_at TIMESTAMP
);
```

**Key Design Decisions:**

1. **Separate Storage Keys**
   - Each asset version has its own S3 key
   - Enables immutable caching of versions
   - Prevents accidental overwrites

2. **ETag Storage**
   - ETags are computed once and stored
   - Avoids recalculation on every request
   - Enables efficient conditional requests

3. **Token Expiration**
   - Time-based model for security
   - Database query validates expiry
   - Cleanup jobs remove expired tokens

### 3. Storage Layer (S3-compatible)

**Purpose:** Store actual file content as immutable blobs

**Design Principles:**

1. **Immutability**
   - Each file version gets unique key
   - Updates create new keys, not overwrites
   - Enables aggressive caching

2. **Key Structure**
   - Assets: `assets/{timestamp}-{random}-{filename}`
   - Versions: `versions/{timestamp}-{random}-{filename}`
   - Enables organization and lifecycle policies

3. **Storage Efficiency**
   - Content-based addressing via ETags
   - Versioning reduces duplicate storage
   - CDN edge caching minimizes origin hits

## Request Flow Diagrams

### Upload Flow

```
Client
  │
  ├─ POST /assets/upload (multipart)
  │
  ▼
Express Middleware
  │
  ├─ Parse multipart form
  │
  ▼
Asset Controller
  │
  ├─ Validate file
  ├─ Generate ETag (SHA-256)
  ├─ Upload to S3
  │   └─ s3.upload() → {bucket}/{key}
  │
  ▼
Asset Model
  │
  ├─ Create asset record
  │   └─ INSERT into assets table
  │
  ▼
Response
  │
  └─ 201 Created with asset metadata
```

### Download Flow (Conditional Request)

```
Client
  │
  ├─ GET /assets/{id}/download
  │   Headers: If-None-Match: "{etag}"
  │
  ▼
Express Middleware
  │
  ├─ Log request
  │
  ▼
Asset Controller
  │
  ├─ Query Asset model
  │   └─ SELECT * FROM assets WHERE id = $1
  │
  ├─ Check If-None-Match
  │   │
  │   ├─ If matches ETag:
  │   │   └─ Return 304 Not Modified
  │   │
  │   └─ If doesn't match or absent:
  │       ├─ Fetch from S3
  │       │   └─ s3.getObject() → Buffer
  │       │
  │       ├─ Set headers
  │       │   ├─ ETag: "{etag}"
  │       │   ├─ Cache-Control: "public, s-maxage=3600..."
  │       │   ├─ Last-Modified: "{date}"
  │       │   └─ Content-Type: "{mime}"
  │       │
  │       └─ Return 200 OK with content
```

### Version Publication Flow

```
Client
  │
  ├─ POST /assets/{id}/publish
  │
  ▼
Asset Controller
  │
  ├─ Fetch asset
  │   └─ SELECT * FROM assets WHERE id = $1
  │
  ├─ Copy in S3
  │   └─ s3.copyObject(source, new_key)
  │
  ├─ Create version record
  │   └─ INSERT into asset_versions
  │
  ├─ Update asset.current_version_id
  │   └─ UPDATE assets SET current_version_id = $1
  │
  ├─ [Optional] Trigger CDN purge
  │   └─ API call to CDN provider
  │
  ▼
Response
  │
  └─ 200 OK with version metadata
```

### Token-Based Private Access

```
Client
  │
  ├─ [1] GET /assets/{id}/access-tokens (server-side)
  │   └─ Returns: {token, expiresAt}
  │
  ├─ [2] GET /assets/private/{token} (client uses token)
  │   │
  │   ▼
  │   Token Validation
  │   │
  │   ├─ Query: SELECT * FROM access_tokens WHERE token = ? AND expires_at > NOW()
  │   │
  │   ├─ If valid:
  │   │   ├─ Fetch asset
  │   │   ├─ Fetch content from S3
  │   │   ├─ Set Cache-Control: private, no-store, no-cache
  │   │   └─ Return 200 OK with content
  │   │
  │   └─ If invalid/expired:
  │       └─ Return 401 Unauthorized
  │
```

## Caching Strategy

### Cache Hierarchy

```
┌─────────────────────────────────────────┐
│  Browser Cache                          │
│  (Client-side, per user)                │
│  ├─ Public Mutable: 60s                 │
│  ├─ Public Versioned: 1 year (infinite) │
│  └─ Private: No cache                   │
└──────────┬──────────────────────────────┘
           │ (Revalidate with If-None-Match)
           │
┌──────────▼──────────────────────────────┐
│  CDN Cache (Edge)                       │
│  (Shared, global distribution)          │
│  ├─ Public Mutable: 1 hour              │
│  ├─ Public Versioned: 1 year (infinite) │
│  └─ Private: No cache                   │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────────────────────────┐
│  Origin Server (Source of Truth)        │
│  ├─ ETag validation                     │
│  ├─ Content serving                     │
│  └─ Metadata management                 │
└─────────────────────────────────────────┘
```

### Cache Control Headers

#### Public Immutable Assets
```
Cache-Control: public, max-age=31536000, immutable
```

**Purpose:** Maximum cacheability for versioned content
- Browser: Caches forever
- CDN: Caches forever
- Revalidation: Never
- Use Case: Static assets, images, documents with version IDs

**Validation:**
- ETag-based (if browser requests)
- No automatic expiration

#### Public Mutable Assets
```
Cache-Control: public, s-maxage=3600, max-age=60
```

**Purpose:** Balance between freshness and cache efficiency
- CDN: Caches for 1 hour
- Browser: Caches for 1 minute
- Pattern: Browser checks every minute, CDN every hour
- Use Case: Regular assets that update infrequently

**Validation:**
- If-None-Match → 304 Not Modified
- Reduces bandwidth by 80-90%

#### Private Assets
```
Cache-Control: private, no-store, no-cache, must-revalidate
```

**Purpose:** Maximum security for sensitive content
- CDN: Does not cache
- Browser: Does not cache
- Pattern: Fetched fresh every time
- Use Case: User-specific content, secrets

### ETag Generation Strategy

**Algorithm:** SHA-256 hash of file content

```javascript
function generateETag(data) {
  const hash = crypto
    .createHash('sha256')
    .update(data)  // Content-based, not time-based
    .digest('hex');
  return `"${hash}"`;
}
```

**Advantages:**
- Content-based (changes when content changes)
- Deterministic (same content = same ETag)
- Strong validation (cryptographic hash)

**Calculation Timing:**
- Computed once during upload
- Stored in database
- Never recalculated on requests
- Reduces CPU load on reads

## Scalability Considerations

### Horizontal Scaling

1. **Stateless API Servers**
   - No session affinity required
   - Load balance across multiple instances
   - Share PostgreSQL connection pool

2. **Database**
   - Single PostgreSQL instance handles metadata
   - Connection pooling prevents exhaustion
   - Read replicas for scaling reads (future)

3. **Object Storage**
   - S3 handles scaling automatically
   - Unlimited capacity and throughput
   - Geographic distribution via CDN

### Performance Optimizations

1. **Database Indexes**
   ```sql
   CREATE INDEX idx_assets_is_private ON assets(is_private);
   CREATE INDEX idx_asset_versions_asset_id ON asset_versions(asset_id);
   CREATE INDEX idx_access_tokens_asset_id ON access_tokens(asset_id);
   CREATE INDEX idx_access_tokens_expires_at ON access_tokens(expires_at);
   ```

2. **S3 Caching**
   - S3 returns Content-Length without reading file
   - CDN edge servers cache content
   - Origin shielding minimizes S3 hits

3. **Connection Pooling**
   - PostgreSQL pool: 20-50 connections
   - Shared across Node.js cluster
   - Prevents connection exhaustion

## Security Architecture

### Defense Layers

```
┌─────────────────────────────────┐
│  1. Transport Security          │
│  └─ HTTPS/TLS encryption        │
├─────────────────────────────────┤
│  2. Origin Shielding            │
│  └─ CDN-only access allowed     │
├─────────────────────────────────┤
│  3. Token Security              │
│  ├─ Cryptographic generation    │
│  ├─ Time-based expiration       │
│  └─ No reuse/revocation (future)│
├─────────────────────────────────┤
│  4. Content Validation          │
│  ├─ ETag verification           │
│  └─ MIME-type checking          │
├─────────────────────────────────┤
│  5. Cache Directives            │
│  └─ Private assets not cached   │
└─────────────────────────────────┘
```

### ETag Security

- Hashes content, not metadata
- Prevents serving stale/poisoned content
- Supports conditional requests safely

### Token Security

- Generated via `crypto.randomBytes()`
- 64 characters (256 bits) of entropy
- Expiration enforced at database level
- Not logged or exposed in responses

## CDN Integration

### Cache Invalidation

```
Asset Update
  │
  ├─ Update asset record
  ├─ Update S3 content
  │
  ├─ [For Mutable Assets]
  │   └─ Trigger CDN purge
  │       └─ Clear /assets/{id}/download from cache
  │
  └─ [For Versioned Assets]
      └─ No purge needed (new URL)
```

### Cloudflare Integration Example

```javascript
async function invalidateCDN(url) {
  const response = await axios.post(
    'https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache',
    { files: [url] },
    { headers: { 'X-Auth-Key': apiKey } }
  );
  return response.data.success;
}
```

### CloudFront Integration Example

```javascript
async function invalidateCDN(key) {
  const cloudfront = new AWS.CloudFront();
  return cloudfront.createInvalidation({
    DistributionId: distributionId,
    InvalidationBatch: {
      Paths: { Quantity: 1, Items: [key] },
      CallerReference: Date.now().toString()
    }
  }).promise();
}
```

### Origin Shielding

**Purpose:** Prevent direct access to origin server, force CDN routing

**Configuration:**
```yaml
Allowed Origins:
  - CDN IP ranges (Cloudflare, CloudFront, Fastly)
  
Blocked Origins:
  - Direct client IPs
  - Other CDNs
  - Scrapers
```

## Deployment Topologies

### Development (Docker Compose)

```
┌─────────────────────────────┐
│  Docker Network             │
├─────────────────────────────┤
│  ┌───────────┐              │
│  │  API      │ :3000        │
│  │  (Node)   │              │
│  └───┬───────┘              │
│      │                      │
│  ┌───▼────────────┐         │
│  │  PostgreSQL    │ :5432   │
│  │  (Dev DB)      │         │
│  └────────────────┘         │
│                             │
│  ┌────────────────┐         │
│  │  MinIO         │ :9000   │
│  │  (Dev Storage) │         │
│  └────────────────┘         │
└─────────────────────────────┘
```

### Production (AWS)

```
┌──────────────────────────────┐
│  CloudFront CDN              │
│  (Edge caching)              │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  ELB / ALB                   │
│  (Load balancer)             │
└──────────────┬───────────────┘
               │
        ┌──────┴──────┐
        │             │
    ┌───▼──┐      ┌───▼──┐
    │ API1 │      │ API2 │ (Auto-scaling)
    │      │      │      │
    └──┬───┘      └──┬───┘
       │             │
       └──────┬──────┘
              │
    ┌─────────▼───────────┐
    │  RDS PostgreSQL     │
    │  (Multi-AZ)         │
    └─────────────────────┘
              │
    ┌─────────▼───────────┐
    │  AWS S3             │
    │  (Object storage)   │
    └─────────────────────┘
```

## Monitoring & Logging

### Key Metrics

1. **Cache Hit Ratio**
   - Target: >95% for public assets
   - Measured: CDN or App logs

2. **Response Times**
   - Target: <100ms average
   - Includes: API + S3 + network

3. **Token Expiry Rate**
   - Tracks: Invalid/expired token attempts
   - Indicates: Configuration or client issues

4. **Error Rates**
   - 4xx: Client errors
   - 5xx: Server errors
   - Threshold: <1% of total requests

### Logging Strategy

```javascript
// Request logging
console.log(`${timestamp} ${method} ${path} ${statusCode} ${duration}ms`);

// Error logging
console.error(`Error: ${message}`, {
  path,
  statusCode,
  error: error.stack,
  context
});
```

## Future Enhancements

1. **Query Optimization**
   - Batch operations for multiple assets
   - Caching layer (Redis) for hot metadata

2. **Token Management**
   - Token revocation (blacklist)
   - Token scoping (partial access)
   - Usage analytics per token

3. **Content Management**
   - Bulk upload operations
   - Asset lifecycle policies
   - Automatic cleanup of old versions

4. **CDN Features**
   - Automatic cache invalidation
   - Geolocated content delivery
   - DDoS protection integration

5. **Observability**
   - Distributed tracing
   - Real-time monitoring dashboard
   - Cache hit ratio tracking

## References

- [HTTP Caching (RFC 7234)](https://tools.ietf.org/html/rfc7234)
- [ETag Specification (RFC 7232)](https://tools.ietf.org/html/rfc7232)
- [AWS S3 Best Practices](https://docs.aws.amazon.com/s3/latest/userguide/)
- [Cloudflare Cache Documentation](https://developers.cloudflare.com/cache/)
