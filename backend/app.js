require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const corsOptions = require('./config/cors');
const logger = require('./middleware/logger');

const webhookRoute = require('./routes/webhook');
const authRoute = require('./routes/auth');
const adminRoute = require('./routes/admin');
const groupsRoute = require('./routes/groups');
const messagesRoute = require('./routes/messages');
const datesRoute = require('./routes/dates');

const app = express();

// ===== Security =====
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ===== Middleware =====
app.use(cors(corsOptions));
app.use(cookieParser());
app.use('/media', express.static(path.join(__dirname, 'media')));
if (process.env.NODE_ENV !== 'production') {
  app.use(logger);
}

// ===== Health Check =====
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Webhook ต้องอยู่ก่อน express.json() เพราะ LINE middleware ต้องอ่าน raw body เอง
app.use('/webhook', webhookRoute);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== API Routes (with rate limiting) =====
app.use('/api', apiLimiter);
app.use('/api/auth', authRoute);
app.use('/api', adminRoute);
app.use('/api/groups', groupsRoute);
app.use('/api/messages', messagesRoute);
app.use('/api/dates', datesRoute);

// ===== Serve Frontend (SPA) =====
const wwwPath = path.join(__dirname, 'www');
app.use(express.static(wwwPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/media') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(wwwPath, 'index.html'));
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;