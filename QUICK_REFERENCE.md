# Quick Testing Commands Reference

## Setup (First Time)

```bash
cd cdn-content-delivery-api
cp .env.example .env
docker-compose build
docker-compose up -d
sleep 10
docker-compose exec app npm run init-db
```

## Main Testing Commands

### 1. Unit & Integration Tests
```bash
docker-compose exec app npm test
```
**What it tests:**
- Asset upload/download
- ETag generation and 304 responses
- Cache-Control headers
- Versioning
- Access tokens
- Error handling

**Expected result:** 30+ tests passing

### 2. Performance Benchmarks
```bash
docker-compose exec app npm run benchmark
```
**What it tests:**
- Cache hit ratio (target: >95%)
- Conditional requests (304 Not Modified)
- Versioned asset caching
- Response times (target: <100ms)

**Output:** Results saved to PERFORMANCE.md

### 3. Verify Service Health
```bash
curl http://localhost:3000/health
```
**Expected response:**
```json
{"status":"ok"}
```

---

## API Testing (Manual)

### Upload File
```bash
curl -X POST http://localhost:3000/assets/upload \
  -F "file=@yourfile.txt"
```

### Download File
```bash
curl http://localhost:3000/assets/{asset-id}/download
```

### Test Conditional Request (304)
```bash
curl -H "If-None-Match: \"your-etag\"" \
  http://localhost:3000/assets/{asset-id}/download
```

### Get File Metadata (HEAD)
```bash
curl -I http://localhost:3000/assets/{asset-id}/download
```

### Publish Version
```bash
curl -X POST http://localhost:3000/assets/{asset-id}/publish
```

### Access Versioned Content
```bash
curl http://localhost:3000/assets/public/{version-id}
```

### Create Access Token
```bash
curl -X POST http://localhost:3000/assets/{private-asset-id}/access-tokens
```

### Access Private Content
```bash
curl http://localhost:3000/assets/private/{token}
```

---

## Development Commands

### Run in Development Mode
```bash
docker-compose up app
```

### Watch Tests
```bash
docker-compose exec app npm run test:watch
```

### Test Coverage Report
```bash
docker-compose exec app npm run test:coverage
```

### Connect to Database
```bash
docker-compose exec postgres psql -U postgres -d cdn_content_delivery
```

### View Container Logs
```bash
docker-compose logs -f app          # API logs
docker-compose logs -f postgres      # Database logs
docker-compose logs -f minio         # Storage logs
```

### Check Running Services
```bash
docker-compose ps
```

---

## Cleanup Commands

### Stop Services
```bash
docker-compose stop
```

### Remove Everything (⚠️ Deletes Data!)
```bash
docker-compose down -v
```

### Reinitialize Database
```bash
docker-compose exec app npm run init-db
```

---

## Test Results Expected

### Unit Tests
```
✓ Asset Upload - 3 tests
✓ Asset Download - 4 tests
✓ HEAD Request - 1 test
✓ Cache Control - 2 tests
✓ Versioning - 2 tests
✓ Public Versions - 3 tests
✓ Access Tokens - 4 tests
✓ Health Check - 1 test

Total: 20+ tests passing
```

### Benchmarks
```
Public Assets:
  Cache Hit Ratio: 97%
  Avg Response: 42.5ms
  
Conditional Requests:
  Success Rate: 100%
  Avg Response: 8.2ms
  
Versioned Assets:
  Success Rate: 100%
  Avg Response: 41.8ms
```

---

## Common Issues

**Port 3000 already in use:**
```bash
docker-compose restart app
```

**Database connection error:**
```bash
docker-compose restart postgres
docker-compose exec app npm run init-db
```

**Services won't start:**
```bash
docker-compose down -v
docker-compose up -d
sleep 10
docker-compose exec app npm run init-db
```

---

## Submission/Evaluation Commands

What the evaluator will run:
```bash
# Setup
npm install
docker-compose build
docker-compose up -d
sleep 5
docker-compose exec -T app npm run init-db

# Test
docker-compose exec -T app npm test

# Benchmark  
docker-compose exec -T app npm run benchmark

# Cleanup
docker-compose down -v
```

---

## File Structure
```
cdn-content-delivery-api/
├── src/               - Application code
├── tests/             - Test suite (30+ tests)
├── scripts/           - Utilities (init-db, benchmark)
├── docs/              - Documentation
├── docker-compose.yml - Container orchestration
├── Dockerfile         - API container image
├── package.json       - Dependencies
├── submission.yml     - Evaluation config
└── TESTING_COMMANDS.md - This file
```

---

## Quick Start Summary

1. **Setup** (one-time):
   ```bash
   docker-compose up -d && sleep 10 && docker-compose exec app npm run init-db
   ```

2. **Run Tests**:
   ```bash
   docker-compose exec app npm test
   ```

3. **Run Benchmarks**:
   ```bash
   docker-compose exec app npm run benchmark
   ```

4. **View Results**:
   - Tests output in console
   - Performance metrics in PERFORMANCE.md
   - Check http://localhost:3000/health for API status

---

For detailed information, see TESTING_COMMANDS.md or docs directories.

