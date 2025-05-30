const onlineUsers = new Map();

const addUserSocket = (userId, socketId) => {
  console.log('userId:', userId, 'socketId:', socketId);
  onlineUsers.set(userId, socketId);
};

const removeUserSocket = (userId) => {
  onlineUsers.delete(userId);
};

const getUserSocket = (userId) => {
  const socketId = onlineUsers.get(userId);
  console.log(`🔍 Fetching socket ID for ${userId}: ${socketId}`);
  return socketId;
};

const logOnlineUsers = () => {
  console.log('🟢 Online users:', Object.fromEntries(onlineUsers));
};

module.exports = {
  addUserSocket,
  removeUserSocket,
  getUserSocket,
  logOnlineUsers,
};
