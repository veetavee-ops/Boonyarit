const jwt = require('jsonwebtoken');
const { Admin } = require('../models');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Exiting.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token || 
                  req.headers.authorization?.replace('Bearer ', '') ||
                  req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findByPk(decoded.id);
    
    if (!admin) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.admin = admin;
    next();
  } catch (error) {
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