const AWS = require('aws-sdk');
const config = require('./env');

let s3Client;

if (config.storage.type === 'minio') {
  s3Client = new AWS.S3({
    endpoint: config.storage.endpoint,
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
  });
} else {
  // AWS S3 production
  s3Client = new AWS.S3({
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  });
}

module.exports = s3Client;
