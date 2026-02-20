const express = require('express');
const router = express.Router();
const { Admin } = require('../models/index');

// POST /api/setup/admin — สร้าง admin ครั้งแรก (one-time setup)
router.post('/setup/admin', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin already exists' });
    }

    const admin = await Admin.create({ username, password });
    res.json({ success: true, admin: { id: admin.id, username: admin.username } });
  } catch (error) {
    console.error('[ERROR] Setup admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admins/all — ใช้ได้เฉพาะ development
router.delete('/admins/all', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Not allowed in production' });
    }
    await Admin.destroy({ where: {} });
    res.json({ success: true, message: 'All admins deleted' });
  } catch (error) {
    console.error('[ERROR] Delete admins:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admins/check
router.get('/admins/check', async (req, res) => {
  try {
    const admins = await Admin.findAll({ attributes: ['id', 'username', 'createdAt'] });
    res.json({ count: admins.length, admins });
  } catch (error) {
    console.error('[ERROR] Check admins:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;