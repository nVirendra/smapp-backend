const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpegPath = ffmpegInstaller.path;

const {
  addUserSocket,
  removeUserSocket,
  logOnlineUsers,
  getUserSocket,
} = require('../utils/socketStore');

const activeFFmpegStreams = new Map(); // streamKey => { ffmpeg, chunkQueue, headerReceived, buffer, lastChunkTime, hlsProcess }

// Create HLS directory if it doesn't exist
const hlsDir = path.join(__dirname, '../public/hls');
if (!fs.existsSync(hlsDir)) {
  fs.mkdirSync(hlsDir, { recursive: true });
}

// 🔍 Check if buffer contains WebM header (EBML signature)
const hasWebMHeader = (buffer) => {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
};

// 🔍 Check if this looks like a valid WebM chunk
const isValidWebMChunk = (buffer) => {
  if (buffer.length < 4) return false;
  const ebmlElements = [0x1A, 0x45, 0xDF, 0xA3, 0x18, 0x53, 0x80, 0x67, 0x1F, 0x43, 0xB6, 0x75];
  return ebmlElements.some(element => buffer[0] === element);
};

// 🎬 Start HLS conversion from RTMP
const startHLSConversion = (streamKey) => {
  const streamHLSDir = path.join(hlsDir, streamKey);
  
  // Create stream-specific directory
  if (!fs.existsSync(streamHLSDir)) {
    fs.mkdirSync(streamHLSDir, { recursive: true });
  }

  const hlsPlaylistPath = path.join(streamHLSDir, 'index.m3u8');
  const hlsSegmentPath = path.join(streamHLSDir, 'segment_%03d.ts');

  console.log(`🎬 Starting HLS conversion for ${streamKey}`);

  const hlsFFmpeg = spawn(ffmpegPath, [
    '-i', `rtmp://localhost:1935/live/${streamKey}`,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-sc_threshold', '0',
    '-g', '30',
    '-keyint_min', '30',
    '-hls_time', '2',
    '-hls_list_size', '10',
    '-hls_wrap', '20',
    '-hls_allow_cache', '0',
    '-hls_flags', 'delete_segments+append_list',
    '-f', 'hls',
    hlsPlaylistPath
  ], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  hlsFFmpeg.stdout.on('data', (data) => {
    console.log(`HLS FFmpeg stdout [${streamKey}]:`, data.toString().trim());
  });

  hlsFFmpeg.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('error') || output.includes('Invalid') || 
        output.includes('warning') || output.includes('frame=')) {
      console.log(`HLS FFmpeg [${streamKey}]:`, output.trim());
    }
  });

  hlsFFmpeg.on('close', (code, signal) => {
    console.log(`🛑 HLS FFmpeg closed for ${streamKey}. Exit code: ${code}, Signal: ${signal}`);
  });

  hlsFFmpeg.on('error', (err) => {
    console.error(`🔥 HLS FFmpeg error for ${streamKey}:`, err.message);
  });

  return hlsFFmpeg;
};

const initNotificationSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId) {
      addUserSocket(userId, socket.id);
      console.log(`✅ ${userId} connected with socket ID ${socket.id}`);
      logOnlineUsers();
    }

    // 🧠 Handle incoming video chunks
    socket.on('stream-chunk', ({ streamKey, chunk, isFirstChunk = false, sequenceNumber = 0 }) => {
      if (!streamKey || !chunk) {
        console.warn(`⚠️ Invalid chunk data for ${streamKey}`);
        return;
      }

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(new Uint8Array(chunk));

      if (buffer.length === 0) {
        console.warn(`⚠️ Empty chunk received for ${streamKey}`);
        return;
      }

      console.log(`📦 Received chunk for ${streamKey}: ${buffer.length} bytes, isFirst: ${isFirstChunk}, seq: ${sequenceNumber}`);

      let streamObj = activeFFmpegStreams.get(streamKey);

      // 🔁 If FFmpeg not yet started for this streamKey
      if (!streamObj) {
        console.log(`🎥 Starting new FFmpeg for streamKey: ${streamKey}`);

        // 🚀 RTMP FFmpeg process
        const rtmpFFmpeg = spawn(ffmpegPath, [
          '-re',
          '-f', 'webm',
          '-analyzeduration', '2000000',
          '-probesize', '2000000',
          '-fflags', '+genpts+igndts+sortdts',
          '-avoid_negative_ts', 'make_zero',
          '-thread_queue_size', '1024',
          '-i', 'pipe:0',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-profile:v', 'baseline',
          '-level', '3.1',
          '-pix_fmt', 'yuv420p',
          '-g', '60',
          '-keyint_min', '60',
          '-sc_threshold', '0',
          '-c:a', 'aac',
          '-ar', '44100',
          '-b:a', '128k',
          '-ac', '2',
          '-f', 'flv',
          '-flvflags', 'no_duration_filesize',
          '-rtmp_live', 'live',
          `rtmp://localhost:1935/live/${streamKey}`,
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // 🔥 RTMP FFmpeg error handling
        rtmpFFmpeg.stdin.on('error', (err) => {
          if (err.code === 'EPIPE' || err.code === 'EOF') {
            console.log(`📡 RTMP FFmpeg stdin closed gracefully for ${streamKey}`);
          } else {
            console.error(`🔥 RTMP FFmpeg stdin error for ${streamKey}:`, err.message);
          }
        });

        rtmpFFmpeg.stderr.on('data', (data) => {
          const output = data.toString();
          if (output.includes('error') || output.includes('Invalid') || 
              output.includes('warning') || output.includes('Stream mapping') ||
              output.includes('Press [q]') || output.includes('frame=')) {
            console.log(`RTMP FFmpeg [${streamKey}]:`, output.trim());
          }
        });

        rtmpFFmpeg.on('close', (code, signal) => {
          console.log(`🛑 RTMP FFmpeg closed for ${streamKey}. Exit code: ${code}, Signal: ${signal}`);
          
          // Stop HLS conversion when RTMP stops
          const streamObj = activeFFmpegStreams.get(streamKey);
          if (streamObj && streamObj.hlsProcess) {
            streamObj.hlsProcess.kill('SIGTERM');
          }
          
          activeFFmpegStreams.delete(streamKey);
        });

        rtmpFFmpeg.on('error', (err) => {
          console.error(`🔥 RTMP FFmpeg process error for ${streamKey}:`, err.message);
          activeFFmpegStreams.delete(streamKey);
        });

        // 🎬 Start HLS conversion with a delay to ensure RTMP stream is available
        setTimeout(() => {
          const hlsProcess = startHLSConversion(streamKey);
          const streamObj = activeFFmpegStreams.get(streamKey);
          if (streamObj) {
            streamObj.hlsProcess = hlsProcess;
          }
        }, 3000); // 3 second delay

        streamObj = { 
          ffmpeg: rtmpFFmpeg, 
          chunkQueue: [],
          headerReceived: false,
          buffer: Buffer.alloc(0),
          lastChunkTime: Date.now(),
          totalBytesReceived: 0,
          chunksReceived: 0,
          hlsProcess: null
        };
        activeFFmpegStreams.set(streamKey, streamObj);
      }

      // Update stream object stats
      streamObj.lastChunkTime = Date.now();
      streamObj.totalBytesReceived += buffer.length;
      streamObj.chunksReceived++;

      // 📦 Handle first chunk specially - wait for complete WebM header
      if (isFirstChunk || !streamObj.headerReceived) {
        streamObj.buffer = Buffer.concat([streamObj.buffer, buffer]);
        
        if (hasWebMHeader(streamObj.buffer) || streamObj.buffer.length > 8192) {
          console.log(`✅ WebM header ${hasWebMHeader(streamObj.buffer) ? 'detected' : 'assumed'} for ${streamKey}`);
          streamObj.headerReceived = true;
          
          if (streamObj.ffmpeg && streamObj.ffmpeg.stdin && streamObj.ffmpeg.stdin.writable) {
            try {
              streamObj.ffmpeg.stdin.write(streamObj.buffer);
              console.log(`📝 Wrote ${streamObj.buffer.length} bytes (header + data) to RTMP FFmpeg for ${streamKey}`);
              streamObj.buffer = Buffer.alloc(0);
            } catch (writeError) {
              console.error(`🔥 Write error for header ${streamKey}:`, writeError.message);
              streamObj.chunkQueue.push(streamObj.buffer);
            }
          } else {
            streamObj.chunkQueue.push(streamObj.buffer);
          }
        } else {
          console.log(`⏳ Buffering header data for ${streamKey}... (${streamObj.buffer.length} bytes)`);
          return;
        }
      } else {
        // 🔄 Regular chunk processing after header
        if (streamObj.ffmpeg && streamObj.ffmpeg.stdin && streamObj.ffmpeg.stdin.writable) {
          try {
            streamObj.ffmpeg.stdin.write(buffer);
            console.log(`📝 Wrote chunk ${sequenceNumber} (${buffer.length} bytes) to RTMP FFmpeg for ${streamKey}`);
          } catch (writeError) {
            console.error(`🔥 Write error for chunk ${streamKey}:`, writeError.message);
            streamObj.chunkQueue.push(buffer);
          }
        } else {
          console.log(`⏸️ Queueing chunk for ${streamKey} (stdin not writable)`);
          streamObj.chunkQueue.push(buffer);
        }
      }

      // 🧹 Process queued chunks if stdin becomes available
      if (streamObj.ffmpeg.stdin && streamObj.ffmpeg.stdin.writable && streamObj.chunkQueue.length > 0) {
        console.log(`🔄 Processing ${streamObj.chunkQueue.length} queued chunks for ${streamKey}`);
        const queuedChunks = streamObj.chunkQueue.splice(0);
        queuedChunks.forEach((queuedBuffer, index) => {
          try {
            streamObj.ffmpeg.stdin.write(queuedBuffer);
            console.log(`📝 Wrote queued chunk ${index} (${queuedBuffer.length} bytes) for ${streamKey}`);
          } catch (err) {
            console.error(`🔥 Error writing queued chunk ${index} for ${streamKey}:`, err.message);
          }
        });
      }

      // 📊 Log stats every 10 chunks
      if (streamObj.chunksReceived % 10 === 0) {
        console.log(`📊 Stream stats for ${streamKey}: ${streamObj.chunksReceived} chunks, ${streamObj.totalBytesReceived} bytes total`);
      }
    });

    // 🛑 Handle stream end
    socket.on('stream-end', ({ streamKey }) => {
      const streamObj = activeFFmpegStreams.get(streamKey);
      if (streamObj) {
        console.log(`🎬 Ending stream for ${streamKey}`);
        
        // End RTMP stream
        if (streamObj.ffmpeg && streamObj.ffmpeg.stdin) {
          try {
            if (streamObj.chunkQueue.length > 0) {
              console.log(`📝 Writing ${streamObj.chunkQueue.length} final chunks for ${streamKey}`);
              streamObj.chunkQueue.forEach(buffer => {
                streamObj.ffmpeg.stdin.write(buffer);
              });
            }
            streamObj.ffmpeg.stdin.end();
          } catch (err) {
            console.error(`🔥 Error ending RTMP stream for ${streamKey}:`, err.message);
          }
        }

        // End HLS conversion
        if (streamObj.hlsProcess) {
          try {
            streamObj.hlsProcess.kill('SIGTERM');
            console.log(`✅ HLS conversion ended for ${streamKey}`);
          } catch (err) {
            console.error(`🔥 Error ending HLS process for ${streamKey}:`, err.message);
          }
        }
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

  // 🧹 Cleanup stale streams every 30 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [streamKey, streamObj] of activeFFmpegStreams.entries()) {
      const timeSinceLastChunk = now - streamObj.lastChunkTime;
      if (timeSinceLastChunk > 30000) {
        console.log(`🧹 Cleaning up stale stream: ${streamKey} (${timeSinceLastChunk}ms since last chunk)`);
        
        if (streamObj.ffmpeg && streamObj.ffmpeg.stdin) {
          try {
            streamObj.ffmpeg.stdin.end();
          } catch (err) {
            console.error(`🔥 Error cleaning up RTMP stream ${streamKey}:`, err.message);
          }
        }

        if (streamObj.hlsProcess) {
          try {
            streamObj.hlsProcess.kill('SIGTERM');
          } catch (err) {
            console.error(`🔥 Error cleaning up HLS process ${streamKey}:`, err.message);
          }
        }

        activeFFmpegStreams.delete(streamKey);
      }
    }
  }, 30000);
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