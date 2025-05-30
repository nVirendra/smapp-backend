const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  senderId: String,
  receiverId: String,
  type: { type: String, enum: ['like'], required: true },
  postId: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);
