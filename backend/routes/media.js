const express = require('express');
const router = express.Router();
const { getSignedUrl } = require('../services/gcsService');

// GET /api/media?path=media/images/2026/03/abc123.jpg
// No auth needed — GCS signed URL expires in 60 min (security sufficient)
router.get('/', async (req, res) => {
    const gcsPath = req.query.path;
    if (!gcsPath) return res.status(400).json({ error: 'path required' });
    try {
        const url = await getSignedUrl(gcsPath, 60);
        res.redirect(url);
    } catch (e) {
        console.error('❌ Media proxy error:', e.message);
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
