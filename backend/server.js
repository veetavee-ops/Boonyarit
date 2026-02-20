const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const sequelize = require('./config/database');
const corsOptions = require('./config/cors');
const setupSockets = require('./sockets/index');

const server = http.createServer(app);

// ===== Socket.IO =====
const io = new Server(server, {
  cors: corsOptions,
});
app.locals.io = io;
setupSockets(io);

// ===== DB Sync & Start =====
sequelize.sync({ alter: true })
  .then(() => {
    console.log('✅ Database synchronized');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(50));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
    });
  })
  .catch((err) => {
    console.error('❌ Database sync error:', err);
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