const setupSockets = (io) => {
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
};

module.exports = setupSockets;