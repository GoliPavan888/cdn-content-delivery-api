const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const NUM_ITERATIONS = 100;
const NUM_CONCURRENT = 10;

let cacheHits = 0;
let cacheMisses = 0;
let totalTime = 0;
let requestCount = 0;

/**
 * Make a GET request and track cache hit/miss based on X-Cache header
 */
async function makeRequest(url, headers = {}) {
  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers,
      validateStatus: () => true, // Accept all status codes
    });
    const duration = Date.now() - startTime;
    totalTime += duration;
    requestCount++;

    const xCache = response.headers['x-cache'] || '';
    const cacheStatus = xCache.includes('HIT') ? 'HIT' : 'MISS';

    if (cacheStatus === 'HIT') {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    return {
      status: response.status,
      duration,
      cache: cacheStatus,
    };
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return null;
  }
}

/**
 * Upload a test file
 */
async function uploadTestFile(filename) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', Buffer.from(`Test content for ${filename}`), {
    filename: filename,
    contentType: 'text/plain',
  });

  try {
    const response = await axios.post(`${BASE_URL}/assets/upload`, form, {
      headers: form.getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error('Upload failed:', error.message);
    return null;
  }
}

/**
 * Benchmark public asset downloads
 */
async function benchmarkPublicAssets() {
  console.log('\n========== BENCHMARK: Public Assets ==========');

  // Upload a test file
  const asset = await uploadTestFile('benchmark-test.txt');
  if (!asset) {
    console.error('Failed to upload test asset');
    return;
  }

  console.log(`Uploaded test asset: ${asset.id}`);
  console.log(`Running ${NUM_ITERATIONS} requests with ${NUM_CONCURRENT} concurrency...`);

  const downloadUrl = `${BASE_URL}/assets/${asset.id}/download`;

  // Warm up: send a few requests to establish cache
  for (let i = 0; i < 3; i++) {
    await makeRequest(downloadUrl);
  }

  cacheHits = 0;
  cacheMisses = 0;
  totalTime = 0;
  requestCount = 0;

  // Run load test
  const startTime = Date.now();

  for (let batch = 0; batch < Math.ceil(NUM_ITERATIONS / NUM_CONCURRENT); batch++) {
    const promises = [];
    const batchSize = Math.min(NUM_CONCURRENT, NUM_ITERATIONS - batch * NUM_CONCURRENT);

    for (let i = 0; i < batchSize; i++) {
      promises.push(makeRequest(downloadUrl));
    }

    await Promise.all(promises);
  }

  const totalTestTime = Date.now() - startTime;

  // Calculate statistics
  const cacheHitRatio = (cacheHits / (cacheHits + cacheMisses)) * 100;
  const avgResponseTime = totalTime / requestCount;
  const requestsPerSecond = (requestCount / totalTestTime) * 1000;

  console.log('\n========== Results ==========');
  console.log(`Total Requests: ${requestCount}`);
  console.log(`Cache Hits: ${cacheHits}`);
  console.log(`Cache Misses: ${cacheMisses}`);
  console.log(`Cache Hit Ratio: ${cacheHitRatio.toFixed(2)}%`);
  console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`Requests/Second: ${requestsPerSecond.toFixed(2)}`);
  console.log(`Total Test Time: ${(totalTestTime / 1000).toFixed(2)}s`);

  return {
    testType: 'public-assets',
    totalRequests: requestCount,
    cacheHits,
    cacheMisses,
    cacheHitRatio: cacheHitRatio.toFixed(2),
    avgResponseTime: avgResponseTime.toFixed(2),
    requestsPerSecond: requestsPerSecond.toFixed(2),
  };
}

/**
 * Benchmark conditional requests (304 Not Modified)
 */
async function benchmarkConditionalRequests() {
  console.log('\n========== BENCHMARK: Conditional Requests (304) ==========');

  // Upload a test file
  const asset = await uploadTestFile('conditional-test.txt');
  if (!asset) {
    console.error('Failed to upload test asset');
    return;
  }

  console.log(`Uploaded test asset: ${asset.id}`);
  console.log(`ETag: ${asset.etag}`);

  const downloadUrl = `${BASE_URL}/assets/${asset.id}/download`;

  // Get the asset first to obtain the ETag
  let etag = asset.etag;

  const startTime = Date.now();
  let notModifiedCount = 0;

  console.log(`Testing ${NUM_ITERATIONS} conditional requests...`);

  for (let batch = 0; batch < Math.ceil(NUM_ITERATIONS / NUM_CONCURRENT); batch++) {
    const promises = [];
    const batchSize = Math.min(NUM_CONCURRENT, NUM_ITERATIONS - batch * NUM_CONCURRENT);

    for (let i = 0; i < batchSize; i++) {
      promises.push(
        (async () => {
          try {
            const response = await axios.get(downloadUrl, {
              headers: { 'If-None-Match': etag },
              validateStatus: () => true,
            });
            if (response.status === 304) {
              notModifiedCount++;
            }
            return response.status;
          } catch (error) {
            return null;
          }
        })()
      );
    }

    await Promise.all(promises);
  }

  const totalTestTime = Date.now() - startTime;

  console.log('\n========== Results ==========');
  console.log(`Total Requests: ${NUM_ITERATIONS}`);
  console.log(`304 Not Modified: ${notModifiedCount}`);
  console.log(`Success Rate: ${((notModifiedCount / NUM_ITERATIONS) * 100).toFixed(2)}%`);
  console.log(`Total Test Time: ${(totalTestTime / 1000).toFixed(2)}s`);

  return {
    testType: 'conditional-requests',
    totalRequests: NUM_ITERATIONS,
    notModifiedResponses: notModifiedCount,
    successRate: ((notModifiedCount / NUM_ITERATIONS) * 100).toFixed(2),
  };
}

/**
 * Benchmark versioned assets (immutable caching)
 */
async function benchmarkVersionedAssets() {
  console.log('\n========== BENCHMARK: Versioned Assets ==========');

  // Upload test file
  const asset = await uploadTestFile('versioned-test.txt');
  if (!asset) {
    console.error('Failed to upload test asset');
    return;
  }

  console.log(`Uploaded test asset: ${asset.id}`);

  // Publish a version
  try {
    const publishUrl = `${BASE_URL}/assets/${asset.id}/publish`;
    const publishResponse = await axios.post(publishUrl);
    const versionId = publishResponse.data.versionId;
    console.log(`Published version: ${versionId}`);

    const versionUrl = `${BASE_URL}/assets/public/${versionId}`;

    const startTime = Date.now();

    console.log(`Testing ${NUM_ITERATIONS} requests to versioned endpoint...`);

    let successCount = 0;

    for (let batch = 0; batch < Math.ceil(NUM_ITERATIONS / NUM_CONCURRENT); batch++) {
      const promises = [];
      const batchSize = Math.min(NUM_CONCURRENT, NUM_ITERATIONS - batch * NUM_CONCURRENT);

      for (let i = 0; i < batchSize; i++) {
        promises.push(
          (async () => {
            try {
              const response = await axios.get(versionUrl, {
                validateStatus: () => true,
              });
              if (response.status === 200) {
                successCount++;
              }
              return response.status;
            } catch (error) {
              return null;
            }
          })()
        );
      }

      await Promise.all(promises);
    }

    const totalTestTime = Date.now() - startTime;

    console.log('\n========== Results ==========');
    console.log(`Total Requests: ${NUM_ITERATIONS}`);
    console.log(`Successful Responses: ${successCount}`);
    console.log(`Success Rate: ${((successCount / NUM_ITERATIONS) * 100).toFixed(2)}%`);
    console.log(`Total Test Time: ${(totalTestTime / 1000).toFixed(2)}s`);

    return {
      testType: 'versioned-assets',
      totalRequests: NUM_ITERATIONS,
      successfulResponses: successCount,
      successRate: ((successCount / NUM_ITERATIONS) * 100).toFixed(2),
    };
  } catch (error) {
    console.error('Versioned asset test failed:', error.message);
    return null;
  }
}

/**
 * Main benchmark runner
 */
async function runBenchmarks() {
  console.log('Starting CDN Content Delivery API Benchmarks...');
  console.log(`API URL: ${BASE_URL}`);

  const results = [];

  try {
    const publicResults = await benchmarkPublicAssets();
    if (publicResults) results.push(publicResults);
  } catch (error) {
    console.error('Public assets benchmark failed:', error.message);
  }

  try {
    const conditionalResults = await benchmarkConditionalRequests();
    if (conditionalResults) results.push(conditionalResults);
  } catch (error) {
    console.error('Conditional requests benchmark failed:', error.message);
  }

  try {
    const versionedResults = await benchmarkVersionedAssets();
    if (versionedResults) results.push(versionedResults);
  } catch (error) {
    console.error('Versioned assets benchmark failed:', error.message);
  }

  // Save results
  const reportPath = path.join(__dirname, '../PERFORMANCE.md');
  const report = generateReport(results);
  fs.writeFileSync(reportPath, report);
  console.log(`\nPerformance report saved to: ${reportPath}`);
}

function generateReport(results) {
  const timestamp = new Date().toISOString();
  let report = `# Performance Benchmark Report\n\n`;
  report += `Generated: ${timestamp}\n\n`;

  for (const result of results) {
    report += `## ${result.testType.replace('-', ' ').toUpperCase()}\n\n`;
    report += Object.entries(result)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');
    report += '\n\n';
  }

  return report;
}

runBenchmarks().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
