const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const sequelize = require('./config/database');
const corsOptions = require('./config/cors');
const setupSockets = require('./sockets/index');
const { startCleanupCron } = require('./services/cleanupService');


const server = http.createServer(app);

// ===== Socket.IO =====
const io = new Server(server, {
  cors: corsOptions,
});
app.locals.io = io;
setupSockets(io);

// ===== DB Sync & Start =====
const syncOptions = process.env.NODE_ENV === 'production' ? {} : { alter: true };
sequelize.sync(syncOptions)
  .then(() => {
    console.log('Database synchronized');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
      startCleanupCron();
    });
  })
  .catch((err) => {
    console.error('Database sync error:', err);
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