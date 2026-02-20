require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const corsOptions = require('./config/cors');
const logger = require('./middleware/logger');

const webhookRoute = require('./routes/webhook');
const authRoute = require('./routes/auth');
const adminRoute = require('./routes/admin');
const groupsRoute = require('./routes/groups');
const messagesRoute = require('./routes/messages');
const attachmentsRoute = require('./routes/attachments');
const datesRoute = require('./routes/dates');

const app = express();

// ===== Middleware =====
app.use(cors(corsOptions));
app.use(cookieParser());
app.use('/webhook', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(path.join(__dirname, 'media')));
app.use(logger);

// ===== Routes =====
app.use('/webhook', webhookRoute);
app.use('/api/auth', authRoute);
app.use('/api', adminRoute);
app.use('/api/groups', groupsRoute);
app.use('/api/messages', messagesRoute);
app.use('/api/attachments', attachmentsRoute);
app.use('/api/dates', datesRoute);

// ===== Error Handler =====
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

module.exports = app;