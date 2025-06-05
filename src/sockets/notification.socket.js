const { PassThrough } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');

const {
  addUserSocket,
  removeUserSocket,
  logOnlineUsers,
  getUserSocket,
} = require('../utils/socketStore');

const activeFFmpegStreams = new Map();


const initNotificationSocket = (io) => {
  io.on('connection', (socket) => {
      const userId = socket.handshake.query.userId;

      if (userId) {
        addUserSocket(userId, socket.id);
        console.log(`✅ ${userId} connected with socket ID ${socket.id}`);
        logOnlineUsers();
      }

      // Handle incoming video chunks
      socket.on('stream-chunk', ({ streamKey, chunk }) => {
        if (!streamKey || !chunk) {
          console.warn(`Invalide chunk for streamKey: ${streamKey}`);
          return;
        }

        // Ensure the chunk is a raw Buffer
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(new Uint8Array(chunk));

        let ffmpegStream = activeFFmpegStreams.get(streamKey);

        if (!ffmpegStream) {
          console.log(`🎬 Starting FFmpeg for streamKey: ${streamKey}`);
          const inputStream = new PassThrough();

          const outputDir = `./media/live/${streamKey}`;
          fs.mkdirSync(outputDir, { recursive: true });

          ffmpeg()
            .setFfmpegPath(ffmpegPath)
            .input(inputStream)
            .inputOptions(['-fflags', '+nobuffer', '-f', 'webm'])
            .inputFormat('webm')
            .videoCodec('libx264')
            .audioCodec('aac')
            .output(`${outputDir}/index.m3u8`)
            .outputOptions([
              '-preset ultrafast',
              '-tune zerolatency',
              '-g 50',
              '-keyint_min 50',
              '-sc_threshold 0',
              '-f hls',
              '-hls_time 2',
              '-hls_list_size 3',
              '-hls_flags delete_segments+omit_endlist',
            ])
            .on('start', () => console.log(`🔴 FFmpeg started for ${streamKey}`))
            .on('stderr', (stderrLine) => console.log(`FFmpeg stderr: ${stderrLine}`))
            .on('error', (err) => {
              console.error(`❌ FFmpeg error for ${streamKey}:`, err.message);
              inputStream.end();
              activeFFmpegStreams.delete(streamKey);
            })
            .on('end', () => {
              console.log(`🟢 FFmpeg ended for ${streamKey}`);
              inputStream.end();
              activeFFmpegStreams.delete(streamKey);
            })
            .run();
          

          activeFFmpegStreams.set(streamKey, inputStream);
          ffmpegStream = inputStream;
        }

        try {
          ffmpegStream.write(bufferChunk);
        } catch (err) {
          console.error(`❌ Error writing chunk to FFmpeg stream:`, err.message);
        }
      });

      // 🛑 Handle stream end
      socket.on('stream-end', ({ streamKey }) => {
        
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