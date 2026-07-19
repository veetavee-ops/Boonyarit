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
const mediaRoute = require('./routes/media');   // ← เพิ่ม
const labelsRoute = require('./routes/labels');
const usersRoute = require('./routes/users');
const lineUsersRoute = require('./routes/lineUsers');
const settingsRoute = require('./routes/settings');
const paymentVerificationRoute = require('./routes/paymentVerification');
const ledgerBalanceRoute = require('./routes/ledgerBalance');
const aiProvidersRoute = require('./routes/aiProviders');

// module สำหรับเปลี่ยนรหัสผ่าน + ลืมรหัสผ่าน (ส่งลิงก์ทาง email) — ดูรายละเอียดใน modules/passwordAuth/index.js
const { createPasswordAuthRouter } = require('./modules/passwordAuth');
const sequelize = require('./config/database');
const { Admin } = require('./models');

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
  max: 1500,  // เพิ่มจาก 300 → 1000
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

// limit ยกจาก default 100kb เพื่อรองรับรูปทดสอบ OCR แบบ base64 ที่ส่งจาก dashboard (ดู
// POST /api/messages/test-ocr) — ต้องแก้ตรงนี้เพราะเป็น express.json() ตัวเดียวที่ใช้ทั้งแอป
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== API Routes (with rate limiting) =====
app.use('/api/media', mediaRoute); // no rate limit — just redirects to GCS signed URL
app.use('/api', apiLimiter);
app.use('/api/auth', authRoute);

// สร้าง router ของ passwordAuth module โดยส่งค่าตั้งค่าของโปรเจกต์นี้เข้าไป
// (ตัว module เองไม่รู้จัก Admin model หรือชื่อ env var ของโปรเจกต์นี้เลย รับผ่าน options ทั้งหมด)
const passwordAuthRouter = createPasswordAuthRouter({
  sequelize,
  UserModel: Admin,
  jwtSecret: process.env.JWT_SECRET,
  appBaseUrl: process.env.FRONTEND_URL,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  fields: { email: 'email', password: 'password' },
  tokenExpiryMinutes: 30,
});
// mount ไว้ที่ path เดียวกับ authRoute เดิม (/api/auth) จะได้ endpoint:
// POST /api/auth/change-password, /api/auth/forgot-password, /api/auth/reset-password/:token
app.use('/api/auth', passwordAuthRouter);
app.use('/api', adminRoute);
app.use('/api/groups', groupsRoute);
app.use('/api/messages', messagesRoute);
app.use('/api/dates', datesRoute);
app.use('/api/labels', labelsRoute);
app.use('/api/users', usersRoute);
app.use('/api/line-users', lineUsersRoute);
app.use('/api/settings', settingsRoute);
app.use('/api/payment-verification', paymentVerificationRoute);
app.use('/api/ledger-balance', ledgerBalanceRoute);
app.use('/api/ai-providers', aiProvidersRoute);


// ===== Serve Frontend (SPA) =====
// Vite ตั้งชื่อไฟล์ JS/CSS ด้วย content hash (เปลี่ยนชื่อทุกครั้งที่เนื้อหาเปลี่ยน)
// เลยแคชไฟล์พวกนี้ได้ตลอดไปอย่างปลอดภัย แต่ index.html ต้องห้ามแคชเด็ดขาด
// ไม่งั้น browser จะค้าง index.html เก่าที่ชี้ไป bundle เก่าที่ไม่มีอยู่แล้วหลัง deploy ใหม่
const wwwPath = path.join(__dirname, 'www');
app.use(express.static(wwwPath, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/media') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache');
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