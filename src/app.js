const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const streamRoutes = require('./routes/stream.routes.js');

//media server module
const NodeMediaServer = require('node-media-server');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
//media server module

//const RTMPStreamServer = require('./rtmp-server');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//start media server code
const ffmpegPath = 'D:\\dev\\ffmpeg-20250529-fb\\bin\\ffmpeg.exe';

// Create media directory if not exists
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Serve HLS files statically
app.use('/media', express.static(path.join(__dirname, 'media')));

// RTMP Server Configuration
const rtmpConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    mediaroot: mediaDir,
    allow_origin: '*',
  },
  //   relay: {
  //     ffmpeg: '/usr/local/bin/ffmpeg',
  //     tasks: []
  //   },
  trans: {
    ffmpeg: ffmpegPath, // Use Windows path here
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
      },
    ],
  },
};

// Start RTMP Server
const nms = new NodeMediaServer(rtmpConfig);

//end start media server code
nms.run();

// Handle stream events
nms.on('preConnect', (id, args) => {
  console.log(
    '[NodeEvent on preConnect]',
    `id=${id} args=${JSON.stringify(args)}`
  );
});

nms.on('postConnect', (id, args) => {
  console.log(
    '[NodeEvent on postConnect]',
    `id=${id} args=${JSON.stringify(args)}`
  );
});

nms.on('doneConnect', (id, args) => {
  console.log(
    '[NodeEvent on doneConnect]',
    `id=${id} args=${JSON.stringify(args)}`
  );
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on prePublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`
  );

  // Extract stream key from path
  const streamKey = StreamPath.split('/').pop();

  // Start HLS conversion
  convertRTMPToHLS(StreamPath, streamKey);
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on postPublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`
  );
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on donePublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`
  );

  const streamKey = StreamPath.split('/').pop();
  cleanupHLSFiles(streamKey);
});

function convertRTMPToHLS(streamPath, streamKey) {
  const outputDir = path.join('./media', streamKey);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const inputUrl = `rtmp://localhost:1935${streamPath}`;
  const outputPath = path.join(outputDir, 'index.m3u8');

  console.log(`Converting RTMP to HLS: ${inputUrl} -> ${outputPath}`);

  const command = ffmpeg(inputUrl)
    .addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-ac 1',
      '-strict -2',
      '-crf 20',
      '-profile:v baseline',
      '-maxrate 400k',
      '-bufsize 1835k',
      '-pix_fmt yuv420p',
      '-hls_time 4',
      '-hls_list_size 5',
      '-hls_wrap 10',
      '-hls_delete_threshold 1',
      '-hls_flags delete_segments',
    ])
    .output(outputPath)
    .on('start', (commandLine) => {
      console.log('FFmpeg process started:', commandLine);
    })
    .on('error', (err, stdout, stderr) => {
      console.error('FFmpeg error:', err.message);
      console.error('FFmpeg stderr:', stderr);
    })
    .on('end', () => {
      console.log('FFmpeg process ended');
    });

  command.run();

  // Store the command reference for cleanup
  global.ffmpegProcesses = global.ffmpegProcesses || new Map();
  global.ffmpegProcesses.set(streamKey, command);
}

function cleanupHLSFiles(streamKey) {
  const outputDir = path.join('./media', streamKey);

  // Kill FFmpeg process
  if (global.ffmpegProcesses && global.ffmpegProcesses.has(streamKey)) {
    const command = global.ffmpegProcesses.get(streamKey);
    command.kill('SIGKILL');
    global.ffmpegProcesses.delete(streamKey);
  }

  // Clean up HLS files
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`Cleaned up HLS files for stream: ${streamKey}`);
  }
}



// Serve static files for HLS streams
//app.use('/streams', express.static(path.join(__dirname, 'streams')));

// Test Route
app.get('/', (_req, res) => {
  res.status(200).send('API is running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/streams', streamRoutes);

module.exports = app;
