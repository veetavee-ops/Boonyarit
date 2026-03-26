const setupSockets = (io) => {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ groupId, date }) => {
      socket.join(`${groupId}-${date}`);
    });
  });
};

module.exports = setupSockets;