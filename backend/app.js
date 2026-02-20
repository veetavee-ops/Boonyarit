require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const sequelize = require('./config/database');
const { Message, User, Group, MessageAttachment, Admin } = require('./models/index');
const webhookRoute = require('./routes/webhook');
const authRoute = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const { summarizeAllChatsForDate } = require('./services/aiService');
const { Op } = require('sequelize');

const app = express();
const server = http.createServer(app);

// ===== Socket.IO Configuration =====
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.locals.io = io;

// ===== CORS Middleware =====
app.use((req, res, next) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL ||
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
    // 'https://frontend-bitter-flower-1312.fly.dev',
    'https://sotusengineering-lineoa.fly.dev'
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// ===== Middleware =====
app.use(cookieParser());
app.use('/webhook', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(path.join(__dirname, 'media')));

// ===== Logging Middleware =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== Public Routes =====
app.use('/webhook', webhookRoute);
app.use('/api/auth', authRoute);

// ===== Admin Setup Route =====
app.post('/api/setup/admin', async (req, res) => {
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

    res.json({
      success: true,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    console.error('[ERROR] Setup admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Admin Management Routes (Development Only) =====
app.delete('/api/admins/all', async (req, res) => {
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

app.get('/api/admins/check', async (req, res) => {
  try {
    const admins = await Admin.findAll({ attributes: ['id', 'username', 'createdAt'] });
    res.json({ count: admins.length, admins });
  } catch (error) {
    console.error('[ERROR] Check admins:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Socket.IO Events =====
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('join-room', ({ groupId, date }) => {
    const room = `${groupId}-${date}`;
    socket.join(room);
    console.log(`📍 Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ===== Protected API Routes =====
// Uncomment to enable authentication for all API routes
// app.use('/api', authMiddleware);

/**
 * GET /api/groups
 * Fetch all groups (both private chats and group chats) for a specific date
 */
app.get('/api/groups', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date parameter is required' });
    }

    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    console.log(`[API] Fetching groups for date: ${date}`);
    console.log(`[API] Date range: ${start} to ${end}`);

    // Fetch private chats
    let privateChats = [];
    try {
      privateChats = await sequelize.query(`
        SELECT DISTINCT
          CONCAT('private_', m."userId") as "groupId",
          u."displayName" as "groupName",
          u."pictureUrl",
          TRUE as "isPrivate",
          MAX(m.timestamp) as "lastMessageTime"
        FROM messages m
        INNER JOIN "Users" u ON u."userId" = m."userId"
        WHERE (m."groupId" IS NULL OR m."groupId" = '') AND m.timestamp BETWEEN :start AND :end
        GROUP BY m."userId", u."displayName", u."pictureUrl"
        ORDER BY "lastMessageTime" DESC
      `, {
        replacements: { start, end },
        type: sequelize.QueryTypes.SELECT
      });
      console.log(`[API] Private chats found: ${privateChats.length}`);
    } catch (error) {
      console.error('[ERROR] Fetching private chats:', error.message);
      console.error('[ERROR] Stack:', error.stack);
    }

    // Fetch group chats
    let groupChats = [];
    try {
      const groupMessages = await Message.findAll({
        where: {
          groupId: { [Op.ne]: null, [Op.ne]: '' }, // Exclude null and empty string
          timestamp: { [Op.between]: [start, end] }
        },
        attributes: [
          'groupId',
          [sequelize.fn('MAX', sequelize.col('timestamp')), 'lastMessageTime']
        ],
        include: [{
          model: Group,
          as: 'group',
          attributes: ['groupName', 'pictureUrl']
        }],
        group: ['Message.groupId', 'group.groupId'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
      });

      groupChats = groupMessages.map(m => ({
        groupId: m.groupId,
        groupName: m.group?.groupName || 'Unknown Group',
        pictureUrl: m.group?.pictureUrl,
        isPrivate: false,
        lastMessageTime: m.dataValues.lastMessageTime
      }));
      console.log(`[API] Group chats found: ${groupChats.length}`);
    } catch (error) {
      console.error('[ERROR] Fetching group chats:', error.message);
      console.error('[ERROR] Stack:', error.stack);
    }

    const allGroups = [...privateChats, ...groupChats];
    console.log(`[API] Total groups: ${allGroups.length}`);

    res.json(allGroups);
  } catch (error) {
    console.error('[ERROR] GET /api/groups:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/dates
 * Fetch all dates that have messages
 */
app.get('/api/dates', async (req, res) => {
  try {
    // Determine database dialect for correct date function
    const dialect = sequelize.getDialect();
    let dateFunc = 'DATE(timestamp)';

    if (dialect === 'sqlite') {
      dateFunc = 'DATE(timestamp)'; // SQLite stores as string usually, but let's hope it works or use strftime
    } else if (dialect === 'postgres') {
      dateFunc = 'DATE(timestamp)';
    }

    // Use raw query for distinct dates to ensure performance and correctness
    const [results] = await sequelize.query(`
      SELECT DISTINCT DATE(timestamp) as date_val
      FROM "messages" -- Quote table name for safety (Postgres is case sensitive sometimes)
      ORDER BY date_val DESC
    `);

    // Default to strict "Msgs" if table name is different, but models usually use plural. 
    // Actually, let's use the Model to be safe about table name.

    // Alternative using Model (safest cross-db):
    // But DISTINCT on transformed column is tricky in Sequelize.
    // Let's try raw query with reliable table name which seems to be "messages" based on previous queries in app.js (line 170).

    const dates = results.map(r => {
      // Postgres returns Date object or string depending on driver
      const d = new Date(r.date_val || r.DATE_VAL || r.date);
      return d.toISOString().split('T')[0];
    });

    res.json(dates);
  } catch (error) {
    console.error('[ERROR] GET /api/dates:', error);
    // Fallback: if query fails, return empty list or try to fetch from recent messages
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/messages
 * Fetch messages for a specific group/chat and date
 */
app.get('/api/messages', async (req, res) => {
  try {
    const { groupId, date } = req.query;

    if (!groupId || !date) {
      return res.status(400).json({ error: 'groupId and date are required' });
    }

    let where = {};

    if (date) {
      const start = new Date(date + 'T00:00:00.000Z');
      const end = new Date(date + 'T23:59:59.999Z');
      where.timestamp = { [Op.between]: [start, end] };
    }

    if (groupId.startsWith('private_')) {
      const userId = groupId.replace('private_', '');
      where.userId = userId;
      where.groupId = { [Op.or]: [null, ''] }; // Handle both NULL and empty string
      console.log(`[API] Fetching private messages for userId: ${userId}`);
    } else {
      where.groupId = groupId;
      console.log(`[API] Fetching group messages for groupId: ${groupId}`);
    }

    console.log('[API] Message query where clause:', JSON.stringify(where, null, 2));

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['displayName', 'pictureUrl'] },
        { model: Group, as: 'group', attributes: ['groupName', 'pictureUrl'] },
        { model: MessageAttachment, as: 'attachments', attributes: ['id', 'fileName', 'fileType'] }
      ],
      order: [['timestamp', 'ASC']]
    });

    console.log(`[API] Messages found: ${messages.length}`);

    res.json(messages);
  } catch (error) {
    console.error('[ERROR] GET /api/messages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/attachments/:id/image
 * Fetch image attachment by ID
 */
app.get('/api/attachments/:id/image', async (req, res) => {
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

/**
 * POST /api/messages/summarize-day
 * Generate AI summary for all messages on a specific date
 */
app.post('/api/messages/summarize-day', async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const start = new Date(date + 'T00:00:00.000Z');
    const end = new Date(date + 'T23:59:59.999Z');

    const allMessages = await Message.findAll({
      where: { timestamp: { [Op.between]: [start, end] } },
      include: [
        { model: User, as: 'user', attributes: ['displayName'] },
        { model: Group, as: 'group', attributes: ['groupName'] }
      ],
      order: [['timestamp', 'ASC']],
      limit: 1000
    });

    if (allMessages.length === 0) {
      return res.json({
        summary: 'ไม่มีข้อความในวันนี้',
        messageCount: 0,
        groupCount: 0
      });
    }

    const result = await summarizeAllChatsForDate(allMessages);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] POST /api/messages/summarize-day:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Error Handler =====
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== Database Sync & Server Start =====
sequelize.sync({ alter: true })
  .then(() => {
    console.log('✅ Database synchronized');
    const PORT = process.env.PORT || 3000
    server.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(50));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
    });
  })
  .catch(err => {
    console.error('❌ Database sync error:', err);
    process.exit(1);
  });

// ===== Graceful Shutdown =====
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    sequelize.close();
    process.exit(0);
  });
});