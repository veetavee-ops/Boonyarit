const express = require('express');
const router = express.Router();
const { MessageAttachment } = require('../models/index');
const sequelize = require('../config/database');

// GET /api/attachments/:id/image
router.get('/:id/image', async (req, res) => {
  try {
    const attachment = await MessageAttachment.findByPk(req.params.id);

    if (!attachment?.fileData) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.set('Content-Type', attachment.fileType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.send(attachment.fileData);
  } catch (error) {
    console.error('[ERROR] GET /api/attachments/:id/image:', error);
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;