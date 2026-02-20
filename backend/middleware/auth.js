const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

const authMiddleware = async (req, res, next) => {
  try {
    // ✅ รับ token จาก 3 ที่: cookies, Authorization header, หรือ query string
    const token = req.cookies?.token || 
                  req.headers.authorization?.replace('Bearer ', '') ||
                  req.query.token;

    console.log('🔐 Auth check:', {
      hasCookie: !!req.cookies?.token,
      hasHeader: !!req.headers.authorization,
      hasQuery: !!req.query.token,
      token: token ? token.substring(0, 20) + '...' : 'none'
    });

    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // ตรวจสอบ token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token valid for user:', decoded.username);
    
    // หา admin
    const admin = await Admin.findByPk(decoded.id);
    
    if (!admin) {
      console.log('❌ Admin not found in database');
      return res.status(401).json({ error: 'Invalid token' });
    }

    // เก็บข้อมูล admin ใน request
    req.admin = admin;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token format' });
    }
    
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = authMiddleware;