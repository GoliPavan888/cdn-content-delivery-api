# CDN Content Delivery API - Endpoint Reference

## Overview

This document provides detailed specifications for all API endpoints, including request/response formats, status codes, and example usage.

## Base URL

```
http://localhost:3000/assets
```

## Authentication

This API does not use traditional authentication. Private content access is controlled via temporary access tokens.

## Response Format

All responses are JSON formatted with the following structure:

### Success Response
```json
{
  "id": "uuid-string",
  "filename": "file.txt",
  "mimeType": "text/plain",
  "size": 1024,
  "etag": "\"sha256hash\"",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Error Response
```json
{
  "error": "Error description"
}
```

## Endpoints

### 1. POST /upload

Upload a new asset file to the system.

**Request**
- Content-Type: `multipart/form-data`
- Parameters:
  - `file` (required): File to upload
  - `isPrivate` (optional): String "true" or "false" to mark as private

**Response: 201 Created**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "size": 2048576,
  "etag": "\"948f8d2b8c5f3a1e...\"",
  "isPrivate": false,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response: 400 Bad Request**
```json
{
  "error": "No file provided"
}
```

**cURL Example**
```bash
curl -X POST http://localhost:3000/assets/upload \
  -F "file=@document.pdf" \
  -F "isPrivate=false"
```

---

### 2. GET /:id/download

Download asset content with conditional request support.

**Request**
- Parameters:
  - `:id` (required): Asset UUID
- Headers:
  - `If-None-Match` (optional): ETag value for conditional requests

**Response: 200 OK**
- Content-Type: `application/octet-stream` (or asset's MIME type)
- Headers:
  - `ETag`: Strong ETag value
  - `Cache-Control`: Appropriate cache control directive
  - `Last-Modified`: RFC 2822 date
  - `Content-Length`: File size in bytes
- Body: File content

**Response: 304 Not Modified**
- Body: Empty
- Headers:
  - `ETag`: Matching ETag value
  - `Last-Modified`: RFC 2822 date

**Response: 404 Not Found**
```json
{
  "error": "Asset not found"
}
```

**cURL Examples**

Basic download:
```bash
curl -O http://localhost:3000/assets/{id}/download
```

With conditional request:
```bash
curl -H 'If-None-Match: "sha256hash"' \
  http://localhost:3000/assets/{id}/download
```

---

### 3. HEAD /:id/download

Retrieve asset metadata without downloading the body.

**Request**
- Parameters:
  - `:id` (required): Asset UUID

**Response: 200 OK**
- Headers (no body):
  - `ETag`: Strong ETag value
  - `Content-Type`: Asset's MIME type
  - `Content-Length`: File size in bytes
  - `Last-Modified`: RFC 2822 date
  - `Cache-Control`: Appropriate cache headers

**Response: 404 Not Found**
```json
{
  "error": "Asset not found"
}
```

**cURL Example**
```bash
curl -I http://localhost:3000/assets/{id}/download
```

---

### 4. POST /:id/publish

Create an immutable version of an asset for permanent caching.

**Request**
- Parameters:
  - `:id` (required): Asset UUID
- Body: Empty or optional JSON

**Response: 200 OK**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "versionId": "660e8400-e29b-41d4-a716-446655440001",
  "filename": "document.pdf",
  "mimeType": "application/pdf",
  "size": 2048576,
  "etag": "\"948f8d2b8c5f3a1e...\"",
  "publishedAt": "2024-01-15T10:35:00Z"
}
```

**Response: 404 Not Found**
```json
{
  "error": "Asset not found"
}
```

**cURL Example**
```bash
curl -X POST http://localhost:3000/assets/{id}/publish
```

---

### 5. GET /public/:version_id

Serve immutable versioned content (maximum cacheability).

**Request**
- Parameters:
  - `:version_id` (required): Version UUID
- Headers:
  - `If-None-Match` (optional): ETag for conditional requests

**Response: 200 OK**
- Content-Type: Asset's MIME type
- Headers:
  - `ETag`: Immutable version ETag
  - `Cache-Control: public, max-age=31536000, immutable`
  - `Last-Modified`: RFC 2822 date
  - `Content-Length`: File size
- Body: File content

**Response: 304 Not Modified**
- Headers (no body):
  - `ETag`: Matching ETag
  - `Cache-Control: public, max-age=31536000, immutable`

**Response: 404 Not Found**
```json
{
  "error": "Version not found"
}
```

**Caching Strategy**
- Browser caches: 1 year
- CDN caches: 1 year
- No revalidation needed
- Safe to link permanently

---

### 6. GET /private/:token

Access private content using a valid, non-expired access token.

**Request**
- Parameters:
  - `:token` (required): Access token string

**Response: 200 OK**
- Content-Type: Asset's MIME type
- Headers:
  - `ETag`: Asset ETag
  - `Cache-Control: private, no-store, no-cache, must-revalidate`
  - `Last-Modified`: RFC 2822 date
  - `Content-Length`: File size
- Body: File content

**Response: 304 Not Modified**
- Headers (no body):
  - `ETag`: Matching ETag
  - `Cache-Control: private, no-store, no-cache, must-revalidate`

**Response: 401 Unauthorized**
```json
{
  "error": "Invalid or expired token"
}
```

**cURL Example**
```bash
curl http://localhost:3000/assets/private/{token}
```

---

### 7. POST /:id/access-tokens

Generate a temporary access token for a private asset.

**Request**
- Parameters:
  - `:id` (required): Asset UUID
- Body: Empty

**Response: 201 Created**
```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2024-01-15T11:30:00Z",
  "expiresIn": 3600
}
```

**Response: 400 Bad Request**
```json
{
  "error": "Access tokens are only for private assets"
}
```

**Response: 404 Not Found**
```json
{
  "error": "Asset not found"
}
```

**Token Properties**
- Length: 64 characters (hex encoded)
- Expiration: 1 hour by default (configurable)
- Cryptographically secure generation
- One-time use not enforced (can be used multiple times)

**cURL Example**
```bash
curl -X POST http://localhost:3000/assets/{id}/access-tokens
```

---

### 8. GET /health

Health check endpoint for monitoring.

**Request**
- No parameters required

**Response: 200 OK**
```json
{
  "status": "ok"
}
```

**cURL Example**
```bash
curl http://localhost:3000/health
```

---

## HTTP Status Codes

| Code | Meaning | Used in |
|------|---------|---------|
| 200 | OK | GET, HEAD, POST endpoints with successful content/metadata |
| 201 | Created | POST /upload, POST /access-tokens |
| 304 | Not Modified | Conditional requests with matching ETags |
| 400 | Bad Request | Invalid parameters, missing files, wrong content types |
| 401 | Unauthorized | Invalid/expired access tokens |
| 404 | Not Found | Non-existent assets or versions |
| 500 | Internal Server Error | Database or storage errors |

## Headers Reference

### Request Headers

| Header | Purpose | Required? |
|--------|---------|-----------|
| `If-None-Match` | ETag conditional request | No |
| `Content-Type` | Request content type | Conditional |

### Response Headers

| Header | Meaning |
|--------|---------|
| `Content-Type` | MIME type of the asset |
| `Content-Length` | Size in bytes |
| `ETag` | Strong validator (content hash) |
| `Cache-Control` | Caching directives |
| `Last-Modified` | Last modification date (RFC 2822) |

## Error Scenarios

### Scenario 1: Download Non-existent Asset
```
GET /assets/invalid-id/download

Response: 404
{
  "error": "Asset not found"
}
```

### Scenario 2: Conditional Request (Cache Hit)
```
GET /assets/{id}/download
If-None-Match: "sha256hash"

Response: 304 Not Modified
(Empty body, headers included)
```

### Scenario 3: Access Private Asset Without Token
```
GET /assets/private/invalid-token

Response: 401
{
  "error": "Invalid or expired token"
}
```

## Rate Limiting

Currently, no rate limiting is implemented. For production, consider adding:
- IP-based rate limiting
- Token-based rate limiting for private content
- CDN rate limiting policies

## Pagination

Not applicable - all endpoints return single resources or fixed collections.

## Versioning

This is API v1. Future versions will maintain backward compatibility or include a version header like `X-API-Version: 1`.

## Examples

### Complete Workflow

1. Upload asset:
```bash
curl -X POST http://localhost:3000/assets/upload \
  -F "file=@image.jpg"
```
Returns: Asset ID + ETag

2. Create conditional request:
```bash
curl -H 'If-None-Match: "{etag}"' \
  http://localhost:3000/assets/{asset-id}/download
```
Returns: 304 if unchanged, 200 with content if changed

3. Publish version for permanent caching:
```bash
curl -X POST http://localhost:3000/assets/{asset-id}/publish
```
Returns: Version ID

4. Access via versioned URL (highly cacheable):
```bash
curl http://localhost:3000/assets/public/{version-id}
```
Returns: 200 with immutable cache headers

5. Private asset workflow:
```bash
# Create token
curl -X POST http://localhost:3000/assets/{asset-id}/access-tokens
# Returns: Access token

# Use token to access
curl http://localhost:3000/assets/private/{token}
```

## Best Practices

1. **Use Versioning for Important Assets**
   - Publish versions for content that shouldn't change
   - Link to version IDs for permanent references

2. **Leverage ETags**
   - Always use If-None-Match in clients
   - Reduces bandwidth by 80-90% for unchanged content

3. **Organize Private Content**
   - Generate tokens server-side only
   - Store token-asset mappings securely
   - Set short expiration times (1-24 hours)

4. **CDN Configuration**
   - Use public versioned URLs with 1-year TTL
   - Use public mutable URLs with 1-hour CDN, 1-minute browser TTL
   - Never cache private URLs at CDN level
