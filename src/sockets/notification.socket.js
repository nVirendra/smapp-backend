const {
  addUserSocket,
  removeUserSocket,
  logOnlineUsers,
  getUserSocket,
} = require('../utils/socketStore');

const initNotificationSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    console.log('userId: ', userId);
    if (userId) {
      addUserSocket(userId, socket.id);
      console.log(`✅ ${userId} connected with socket ID ${socket.id}`);
      logOnlineUsers();
    }

    socket.on('disconnect', () => {
      if (userId) {
        removeUserSocket(userId);
        console.log(`🔴 ${userId} disconnected`);
        logOnlineUsers();
      }
    });
  });
};

const sendNotificationToUser = (io, receiverId, data) => {
  const socketId = getUserSocket(receiverId);

  console.log(`📨 Notifying ${receiverId} → socket: ${socketId}`);

  if (socketId) {
    console.log(socketId, data);
    io.to(socketId).emit('new-notification', data);
  } else {
    console.warn(`⚠️ No socket found for user ${receiverId}`);
  }
};

module.exports = {
  initNotificationSocket,
  sendNotificationToUser,
};
