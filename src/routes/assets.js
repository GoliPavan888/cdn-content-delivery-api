const express = require('express');
const multer = require('multer');
const controller = require('../controllers/assetController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload endpoint
router.post('/upload', upload.single('file'), controller.upload);

// Download endpoints with conditional request support
router.head('/:id/download', controller.headDownload);
router.get('/:id/download', controller.download);

// Publish/version endpoint
router.post('/:id/publish', controller.publish);

// Public versioned content
router.get('/public/:version_id', controller.getPublicVersion);

// Private content access
router.get('/private/:token', controller.getPrivateContent);

// Access token management
router.post('/:id/access-tokens', controller.createAccessToken);

module.exports = router;
