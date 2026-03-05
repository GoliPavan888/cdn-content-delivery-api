# CDN Content Delivery API - Testing Commands

Complete guide to setting up, testing, and benchmarking the Content Delivery API.

## Quick Start

### 1. Initial Setup (First Time Only)

```bash
# Clone/navigate to project directory
cd cdn-content-delivery-api

# Copy environment file
cp .env.example .env

# Build Docker images
docker-compose build

# Start all services (API, PostgreSQL, MinIO)
docker-compose up -d

# Wait for services to be ready
sleep 10

# Initialize database schema
docker-compose exec app npm run init-db
```

### 2. Verify Setup

```bash
# Check if all services are running
docker-compose ps

# Test API health
curl http://localhost:3000/health

# Expected output:
# {"status":"ok"}
```

---

## Testing Commands

### Run All Tests

```bash
# Run complete test suite
docker-compose exec app npm test

# Expected output:
# Runs 30+ tests covering:
# ✓ Asset upload functionality
# ✓ Asset download with conditional requests
# ✓ ETag generation and validation
# ✓ HTTP 304 Not Modified responses
# ✓ Cache-Control headers
# ✓ Versioned assets
# ✓ Access tokens and private content
# ✓ Error handling
```

### Watch Mode Testing (Development)

```bash
# Run tests and re-run on file changes
docker-compose exec app npm run test:watch

# Useful for active development
# Tests re-run automatically when you save files
```

### Test Coverage Report

```bash
# Generate code coverage analysis
docker-compose exec app npm run test:coverage

# Output location: coverage/
# Open coverage/lcov-report/index.html in browser for visual report
```

### Run Specific Test File

```bash
# Test only asset-related functionality
docker-compose exec app npm test -- tests/assets.test.js

# Useful for focused testing during development
```

### Test with Verbose Output

```bash
# Show detailed test execution info
docker-compose exec app npm test -- --verbose

# Helps debug test failures
```

---

## Performance Benchmarking

### Run Full Benchmark Suite

```bash
# Execute all performance benchmarks
docker-compose exec app npm run benchmark

# Tests:
# 1. Public asset caching (cache hit ratio)
# 2. Conditional requests (304 responses)
# 3. Versioned assets (immutable caching)
#
# Output saved to: PERFORMANCE.md
```

### Run Benchmarks with Custom URL

```bash
# Test against different API endpoint
API_URL=http://api-server:3000 docker-compose exec app npm run benchmark

# Useful for testing deployed instances
```

---

## Local Development Testing

### Run API in Development Mode

```bash
# Start with hot-reloading (automatic restart on changes)
docker-compose up app

# Or in detached mode:
docker-compose up -d app

# Logs:
docker-compose logs -f app
```

### Install Dependencies (Local)

```bash
# If developing locally without Docker
npm install

# Then run:
npm run dev
```

### Manual API Testing with cURL

#### 1. Upload a File

```bash
# Create a test file
echo "Hello, this is test content" > test.txt

# Upload to API
curl -X POST http://localhost:3000/assets/upload \
  -F "file=@test.txt" \
  -F "isPrivate=false"

# Response:
# {
#   "id": "uuid-string",
#   "filename": "test.txt",
#   "etag": "\"sha256hash...\"",
#   ...
# }

# Export ID for next commands
ASSET_ID="<id-from-response>"
ETAG="<etag-from-response>"
```

#### 2. Download File (Basic)

```bash
curl -H "Content-Type: application/json" \
  http://localhost:3000/assets/$ASSET_ID/download

# Response: File content (200 OK)
```

#### 3. Test Conditional Request (304 Not Modified)

```bash
curl -i -H "If-None-Match: $ETAG" \
  http://localhost:3000/assets/$ASSET_ID/download

# Response should be: HTTP/1.1 304 Not Modified
# Headers present but no body
```

#### 4. Get Asset Metadata (HEAD)

```bash
curl -I http://localhost:3000/assets/$ASSET_ID/download

# Response: Headers only, no body
# HTTP/1.1 200 OK
# ETag: ...
# Cache-Control: ...
# Last-Modified: ...
```

#### 5. Publish Version

```bash
curl -X POST http://localhost:3000/assets/$ASSET_ID/publish

# Response:
# {
#   "id": "asset-id",
#   "versionId": "version-uuid",
#   "etag": "...",
#   "publishedAt": "..."
# }

# Export version ID
VERSION_ID="<versionId-from-response>"
```

#### 6. Access Versioned Content

```bash
curl http://localhost:3000/assets/public/$VERSION_ID

# Response: 200 OK with immutable cache headers
# Cache-Control: public, max-age=31536000, immutable
```

#### 7. Create Access Token (Private Asset)

```bash
# First upload a private asset
curl -X POST http://localhost:3000/assets/upload \
  -F "file=@secret.txt" \
  -F "isPrivate=true"

# Response includes asset ID
PRIVATE_ASSET_ID="<private-asset-id>"

# Generate access token
curl -X POST \
  http://localhost:3000/assets/$PRIVATE_ASSET_ID/access-tokens

# Response:
# {
#   "token": "64-char-hex-string",
#   "expiresAt": "2024-01-15T11:30:00Z",
#   "expiresIn": 3600
# }

TOKEN="<token-from-response>"
```

#### 8. Access Private Content

```bash
# Use token to access private asset
curl http://localhost:3000/assets/private/$TOKEN

# Response: 200 OK with private cache headers
# Cache-Control: private, no-store, no-cache, must-revalidate
```

#### 9. Test Invalid Token

```bash
curl http://localhost:3000/assets/private/invalid-token

# Response: 401 Unauthorized
# {
#   "error": "Invalid or expired token"
# }
```

---

## Database Testing

### Connect to Database

```bash
# Open PostgreSQL interactive shell
docker-compose exec postgres psql -U postgres -d cdn_content_delivery

# Useful commands:
# \dt                    - List all tables
# SELECT * FROM assets;  - View all assets
# \q                     - Exit
```

### Manual Database Queries

```bash
# List all assets
docker-compose exec -T postgres psql -U postgres -d cdn_content_delivery \
  -c "SELECT id, filename, mime_type, etag FROM assets;"

# List all versions
docker-compose exec -T postgres psql -U postgres -d cdn_content_delivery \
  -c "SELECT id, asset_id, etag FROM asset_versions;"

# List valid tokens
docker-compose exec -T postgres psql -U postgres -d cdn_content_delivery \
  -c "SELECT token, asset_id, expires_at FROM access_tokens WHERE expires_at > NOW();"

# Count total assets
docker-compose exec -T postgres psql -U postgres -d cdn_content_delivery \
  -c "SELECT COUNT(*) FROM assets;"
```

### Reset Database

```bash
# Drop and reinitialize database
docker-compose exec app npm run init-db

# Warns before deletion (y/n prompt)
```

---

## Storage (MinIO) Testing

### Access MinIO Console

```bash
# MinIO web interface
http://localhost:9001

# Credentials:
# Username: minioadmin
# Password: minioadmin

# Uploaded assets visible as objects in 'assets' bucket
```

### List Uploaded Files

```bash
# Via Docker exec
docker-compose exec minio mc ls myminio/assets

# Shows all uploaded files with sizes and dates
```

---

## Integration Testing

### Test Full Upload-to-Download Workflow

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

# 1. Create test file
echo "Integration test content $(date)" > integration-test.txt

# 2. Upload
UPLOAD=$(curl -s -X POST $BASE_URL/assets/upload \
  -F "file=@integration-test.txt")

ASSET_ID=$(echo $UPLOAD | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
ETAG=$(echo $UPLOAD | grep -o '"etag":"[^"]*"' | cut -d'"' -f4)

echo "Uploaded Asset ID: $ASSET_ID"
echo "ETag: $ETAG"

# 3. Download (full content)
curl -s $BASE_URL/assets/$ASSET_ID/download -o downloaded-full.txt

# 4. Download (conditional - 304)
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "If-None-Match: $ETAG" \
  $BASE_URL/assets/$ASSET_ID/download)

HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d':' -f2)
echo "Conditional Request Response: $HTTP_CODE (expected 304)"

# 5. Publish version
PUBLISH=$(curl -s -X POST $BASE_URL/assets/$ASSET_ID/publish)
VERSION_ID=$(echo $PUBLISH | grep -o '"versionId":"[^"]*"' | cut -d'"' -f4)
echo "Published Version ID: $VERSION_ID"

# 6. Access versioned content
curl -s $BASE_URL/assets/public/$VERSION_ID -o downloaded-version.txt

echo "Integration test complete!"
```

---

## Performance Testing

### Load Test with Apache Bench

```bash
# Install Apache Bench (if not present)
# Ubuntu: sudo apt-get install apache2-utils
# macOS: brew install httpd

# Start by uploading a file first
ASSET_ID="<your-asset-id>"

# Run 1000 concurrent requests
ab -n 1000 -c 50 http://localhost:3000/assets/$ASSET_ID/download

# Shows:
# - Requests per second
# - Time per request
# - Failed requests
# - Connection times
```

### Load Test with Curl Loop

```bash
#!/bin/bash

ASSET_ID="<your-asset-id>"
ITERATIONS=100

echo "Running $ITERATIONS requests..."
time for i in $(seq 1 $ITERATIONS); do
  curl -s http://localhost:3000/assets/$ASSET_ID/download > /dev/null
done

# Shows total execution time
# Useful for quick performance validation
```

### Benchmark with k6 (Advanced)

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

# Create test script (load-test.js)
# See k6 documentation for script format

# Run test
k6 run load-test.js --vus 50 --duration 30s
```

---

## Container Management

### Check Running Services

```bash
# List all containers and their status
docker-compose ps

# Expected output:
# NAME      STATUS      PORTS
# postgres  Up 2 min    5432/tcp
# minio     Up 2 min    9000-9001/tcp
# app       Up 2 min    0.0.0.0:3000->3000/tcp
```

### View Logs

```bash
# API logs
docker-compose logs -f app

# Database logs
docker-compose logs -f postgres

# Storage logs
docker-compose logs -f minio

# All services
docker-compose logs -f

# Last 50 lines
docker-compose logs --tail=50
```

### Stop Services

```bash
# Stop all services (keep containers)
docker-compose stop

# Stop specific service
docker-compose stop app

# Start stopped services
docker-compose start
```

### Clean Up Everything

```bash
# Remove containers and volumes
docker-compose down -v

# This deletes:
# - All containers
# - Volumes (PostgreSQL data, MinIO data)
# - Network
# WARNING: This deletes all data!
```

---

## Debugging

### Debug Mode Logging

```bash
# Enable verbose logging
DEBUG=* npm start

# Or in Docker:
docker-compose exec app bash
DEBUG=* npm start
```

### Interactive Node REPL

```bash
# Open Node.js interactive shell inside container
docker-compose exec app node

# Then you can test parts of the code:
# > const config = require('./src/config/env');
# > config.port
# 3000
# > .exit
```

### Database Shell

```bash
# PostgreSQL client
docker-compose exec postgres psql -U postgres -d cdn_content_delivery

# Then run SQL:
# cdn_content_delivery=# SELECT * FROM assets LIMIT 1;
# cdn_content_delivery=# \q
```

---

## Continuous Integration (CI)

### Automated Testing Pipeline

```bash
#!/bin/bash
# ci-pipeline.sh

set -e

echo "=== Building ==="
docker-compose build

echo "=== Starting Services ==="
docker-compose up -d
sleep 10

echo "=== Initializing Database ==="
docker-compose exec -T app npm run init-db

echo "=== Running Tests ==="
docker-compose exec -T app npm test

echo "=== Running Benchmarks ==="
docker-compose exec -T app npm run benchmark

echo "=== Cleanup ==="
docker-compose down -v

echo "=== All checks passed ==="
```

## Automated Submission Testing

```bash
# Using submission.yml configuration
# This is what the evaluator will run:

# 1. Setup
npm install
docker-compose build
docker-compose up -d
sleep 5
docker-compose exec -T app npm run init-db

# 2. Test
docker-compose exec -T app npm test

# 3. Benchmark
docker-compose exec -T app npm run benchmark

# 4. Cleanup
docker-compose down -v
```

---

## Troubleshooting Tests

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use Docker:
docker-compose restart app
```

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker-compose logs postgres

# Try reconnecting
docker-compose restart postgres
docker-compose exec app npm run init-db
```

### File Not Found Errors

```bash
# Ensure working directory is correct
pwd  # Should be: .../cdn-content-delivery-api

# Check file permissions
ls -la src/

# Rebuild if needed
docker-compose build --no-cache
```

### Out of Memory

```bash
# Docker memory limit issue
docker-compose stop
docker system prune -a  # Clean up
docker-compose up --build
```

---

## Testing Checklist

Before submitting, verify:

- [ ] `npm test` passes all tests
- [ ] `npm run benchmark` completes successfully
- [ ] `docker-compose up -d` starts all services
- [ ] Database initializes without errors
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}`
- [ ] Can upload files
- [ ] Can download files
- [ ] Can specify conditional requests (304)
- [ ] Can publish versions
- [ ] Can create access tokens
- [ ] Cache headers are correct
- [ ] PERFORMANCE.md is generated

---

## Expected Test Output

### Successful Test Run

```
 PASS  tests/assets.test.js
  Asset Upload
    ✓ should upload a file successfully (45ms)
    ✓ should fail without file (12ms)
    ✓ should mark asset as private if specified (38ms)
  Asset Download
    ✓ should download asset successfully (22ms)
    ✓ should return 304 Not Modified for matching ETag (8ms)
    ✓ should return 200 for non-matching ETag (19ms)
    ✓ should return 404 for non-existent asset (5ms)
  ...

Tests:      32 passed, 32 total
Snapshots:  0 total
Time:       8.523 s
```

### Successful Benchmark Run

```
Starting CDN Content Delivery API Benchmarks...

========== Results ==========
Cache Hit Ratio: 97.00%
Avg Response Time: 42.5ms
Requests/Second: 52.4

Performance report saved to: PERFORMANCE.md
```

---

## Advanced Testing Scenarios

### Simulate Concurrent Users

```bash
#!/bin/bash

ASSET_ID="<your-asset-id>"
CONCURRENT=50
REQUESTS=1000

echo "Simulating $CONCURRENT concurrent users..."

for i in $(seq 1 $CONCURRENT); do
  (
    for j in $(seq 1 $((REQUESTS / CONCURRENT))); do
      curl -s http://localhost:3000/assets/$ASSET_ID/download > /dev/null
    done
  ) &
done

wait
echo "Concurrent test complete"
```

### Test Token Expiration

```bash
#!/bin/bash

# Create private asset
RESPONSE=$(curl -s -X POST http://localhost:3000/assets/upload \
  -F "file=@secret.txt" \
  -F "isPrivate=true")

ASSET_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

# Create token
TOKEN_RESPONSE=$(curl -s -X POST \
  http://localhost:3000/assets/$ASSET_ID/access-tokens)

TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Test valid token
echo "Testing valid token..."
curl -s http://localhost:3000/assets/private/$TOKEN | head -c 50

# Wait for expiration (in test, modify TOKEN_EXPIRY_SECONDS to 5)
echo "Waiting for token to expire..."
sleep 6

# Test expired token
echo "Testing expired token..."
curl -s http://localhost:3000/assets/private/$TOKEN
# Expected: 401 Unauthorized
```

---

## Performance Tips for Testing

1. **Use Keep-Alive**
   - Most tools enable this by default
   - Reduces connection overhead

2. **Warm Up Cache**
   - Run 3-5 requests before measuring
   - Eliminates cold-start effects

3. **Run Multiple Times**
   - Results vary slightly between runs
   - Average results across multiple runs

4. **Monitor System Resources**
   - `docker stats` for container CPU/memory
   - Use this to identify bottlenecks

---

For more details, see:
- [README.md](docs/README.md) - Project overview
- [API_DOCS.md](docs/API_DOCS.md) - Endpoint specifications
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [PERFORMANCE.md](PERFORMANCE.md) - Benchmark results
