// Polyfill fetch globals for googleapis (requires Node 18+ undici)
if (!globalThis.Headers) {
  const { Headers, fetch, Request, Response } = require('undici');
  globalThis.Headers = Headers;
  globalThis.fetch = fetch;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const sequelize = require('./config/database');
const corsOptions = require('./config/cors');
const setupSockets = require('./sockets/index');
const { startCleanupCron } = require('./services/cleanupService');
const { alertError, notifyAdmin } = require('./services/notifyService');


const server = http.createServer(app);

// ===== Socket.IO =====
const io = new Server(server, {
  cors: corsOptions,
});
app.locals.io = io;
setupSockets(io);

// ===== DB Sync & Start =====
const syncOptions = {};
// payment_verification เก็บใน schema แยกจาก public (ledger การเงิน ไม่ปนกับตาราง messages ทั่วไป)
// ต้องสร้าง schema เองก่อน เพราะ sequelize.sync() ไม่สร้าง schema ให้อัตโนมัติ
sequelize.query('CREATE SCHEMA IF NOT EXISTS payment_verification')
  .then(() => sequelize.sync(syncOptions))
  .then(() => {
    console.log('Database synchronized');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      startCleanupCron();
      notifyAdmin('✅ LINE OA Server เริ่มทำงานแล้ว');
    });
  })
  .catch((err) => {
    console.error('Database sync error:', err);
    alertError('Database', err.message);
    process.exit(1);
  });

// ===== Graceful Shutdown =====
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down...');
  server.close(() => {
    sequelize.close();
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('💥 uncaughtException:', err.message);
  alertError('Server Crash', err.message);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('💥 unhandledRejection:', msg);
  alertError('Unhandled Error', msg);
});