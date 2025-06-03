const {
  addUserSocket,
  removeUserSocket,
  logOnlineUsers,
  getUserSocket,
} = require('../utils/socketStore');

const { spawn } = require('child_process');
const activeFFmpegStreams = new Map(); // streamKey => ffmpeg process

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

      // Start FFmpeg process if not already running for this stream
      if (!activeFFmpegStreams.has(streamKey)) {
        console.log(`🎥 Starting new FFmpeg for streamKey: ${streamKey}`);

        const ffmpegPath = 'D:\\dev\\ffmpeg-20250529-fb\\bin\\ffmpeg.exe'; // replace with your actual path

        const ffmpeg = spawn(ffmpegPath, [
          '-i',
          'pipe:0',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-tune',
          'zerolatency',
          '-c:a',
          'aac',
          '-ar',
          '44100',
          '-f',
          'flv',
          `rtmp://localhost:1935/live/${streamKey}`,
        ]);

        ffmpeg.stderr.on('data', (data) => {
          console.log(`FFmpeg [${streamKey}]:`, data.toString());
        });

        ffmpeg.on('close', (code) => {
          console.log(`🛑 FFmpeg for ${streamKey} exited with code ${code}`);
          activeFFmpegStreams.delete(streamKey);
        });

        activeFFmpegStreams.set(streamKey, ffmpeg);
      }

      // Write video chunk to FFmpeg stdin
      const ffmpeg = activeFFmpegStreams.get(streamKey);
      if (ffmpeg && ffmpeg.stdin.writable) {
        ffmpeg.stdin.write(Buffer.from(chunk));
      }
    });

    // 🔌 Handle disconnect
    socket.on('disconnect', () => {
      if (userId) {
        removeUserSocket(userId);
        console.log(`🔴 ${userId} disconnected`);
        logOnlineUsers();
      }

      // Stop all ffmpeg processes for the disconnected socket
      activeFFmpegStreams.forEach((ffmpeg, streamKey) => {
        try {
          ffmpeg.stdin.end();
          ffmpeg.kill('SIGINT');
          activeFFmpegStreams.delete(streamKey);
        } catch (err) {
          console.warn(`Error stopping FFmpeg for ${streamKey}:`, err);
        }
      });
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
