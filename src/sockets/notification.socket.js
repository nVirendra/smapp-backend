const { spawn } = require('child_process');
const fs = require('fs');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = ffmpegInstaller.path;

const {
  addUserSocket,
  removeUserSocket,
  logOnlineUsers,
  getUserSocket,
} = require('../utils/socketStore');

const activeFFmpegStreams = new Map(); // streamKey => { ffmpeg, chunkQueue }

const initNotificationSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId) {
      addUserSocket(userId, socket.id);
      console.log(`✅ ${userId} connected with socket ID ${socket.id}`);
      logOnlineUsers();
    }

    // 🧠 Handle incoming video chunks
    socket.on('stream-chunk', ({ streamKey, chunk }) => {
      if (!streamKey || !chunk) return;

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(new Uint8Array(chunk));

        if (!fs.existsSync('./debug')) fs.mkdirSync('./debug');
        fs.writeFileSync(`./debug/${streamKey}-first-chunk.webm`, buffer);


      let streamObj = activeFFmpegStreams.get(streamKey);

      // 🔁 If FFmpeg not yet started for this streamKey
      if (!streamObj) {
        console.log(`🎥 Starting new FFmpeg for streamKey: ${streamKey}`);

        const chunkQueue = [];

        const ffmpeg = spawn(ffmpegPath, [
          '-f', 'webm',
          '-analyzeduration', '0',
          '-probesize', '32',
          '-i', 'pipe:0',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-c:a', 'aac',
          '-ar', '44100',
          '-f', 'flv',
          `rtmp://localhost:1935/live/${streamKey}`,
        ]);

        ffmpeg.stdin.on('error', (err) => {
          console.error(`🔥 FFmpeg stdin error for ${streamKey}:`, err.message);
        });

        ffmpeg.stderr.on('data', (data) => {
          console.log(`FFmpeg [${streamKey}]:`, data.toString());
        });

        ffmpeg.on('close', (code, signal) => {
          console.log(`🛑 FFmpeg closed. Exit code: ${code}, Signal: ${signal}`);
          activeFFmpegStreams.delete(streamKey);
        });

        streamObj = { ffmpeg, chunkQueue };
        activeFFmpegStreams.set(streamKey, streamObj);
      }

      // ✅ Write to stdin directly or queue if temporarily blocked
      if (streamObj.ffmpeg.stdin.writable) {
        streamObj.ffmpeg.stdin.write(buffer);
      } else {
        streamObj.chunkQueue.push(buffer);
      }
    });

    // 🔌 Handle disconnect
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
    io.to(socketId).emit('new-notification', data);
  } else {
    console.warn(`⚠️ No socket found for user ${receiverId}`);
  }
};

module.exports = {
  initNotificationSocket,
  sendNotificationToUser,
};
