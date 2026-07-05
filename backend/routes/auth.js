const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'F9yadKNWctYZ1+cSPIzxE3Vtg/lla6EePC4P6CDOudkSx21hNHzweERIfeMQo+j3gZ+cF2KMU99H4xNnKP/uZw==';

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find admin
    const admin = await Admin.findOne({ where: { username } });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Validate password
    if (!admin.validatePassword) {
      console.error('❌ validatePassword method not found!');
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'validatePassword method missing'
      });
    }

    const isValid = await admin.validatePassword(password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create token
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        lineUserId: admin.lineUserId,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error.message);

    // ✅ ส่ง error details กลับไป (DEV only)
    res.status(500).json({
      error: 'Login failed',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, password, inviteCode } = req.body;

    // Simple security check
    const REGISTER_SECRET = process.env.REGISTER_SECRET || 'admin-secret-key';

    if (inviteCode !== REGISTER_SECRET) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check existing
    const existing = await Admin.findOne({ where: { username } });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create admin (password hashed by hooks)
    const admin = await Admin.create({ username, password });

    res.json({ success: true, message: 'Admin created successfully' });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findByPk(decoded.id, {
      attributes: ['id', 'username', 'role', 'lineUserId', 'email']
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({ admin });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findByPk(decoded.id);
    if (!admin) return res.status(401).json({ error: 'Invalid token' });

    const { lineUserId, email } = req.body;
    const updates = {};

    if (lineUserId !== undefined) {
      updates.lineUserId = lineUserId || null;
    }

    // อีเมล — ใช้สำหรับ "ลืมรหัสผ่าน" เท่านั้น ปล่อยว่างได้ (เอาออกจากบัญชีก็ได้)
    if (email !== undefined) {
      const trimmed = (email || '').trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
      }
      updates.email = trimmed || null;
    }

    await admin.update(updates);

    res.json({ ok: true, lineUserId: admin.lineUserId, email: admin.email });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว' });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;