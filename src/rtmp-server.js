const NodeMediaServer = require('node-media-server');
const fs = require('fs');
const path = require('path');


// ✅ Ensure ./media/live directory exists
const baseDir = path.join(__dirname, 'media', 'live');
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true });
  console.log('📁 Created directory:', baseDir);
}

const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media',
  },
  trans: {
    ffmpeg: 'D:\\emilo\\ffmpeg-20250529-fb\\bin\\ffmpeg.exe',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
      },
    ],
  },
};

const startNodeMediaServer = () => {
  const nms = new NodeMediaServer(config);
   console.log('here is');
   nms.on('postPublish', (id, streamPath, args) => {
  if (!streamPath || typeof streamPath !== 'string') {
    console.warn('⚠️ streamPath is undefined or invalid:', streamPath);
    return;
  }

  const streamKey = streamPath.split('/').pop();
  console.log(`✅ Stream is live: http://localhost:8000/live/${streamKey}/index.m3u8`);
});


  

  nms.run();
  console.log('🎥 RTMP + HLS media server is running...');
};

module.exports = startNodeMediaServer;
