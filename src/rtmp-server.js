

const ffmpegPath = require('ffmpeg-static');
const NodeMediaServer = require('node-media-server');

const nmsConfig = {
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
    ffmpeg: ffmpegPath, // use same ffmpeg-static path
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: false,
      },
    ],
  },
};

const startNodeMediaServer = () => {
  const nms = new NodeMediaServer(nmsConfig);


  nms.run();
  
  nms.on('postPublish', (id, streamPath, args) => {
    console.log(`[NodeEvent on postPublish] Stream started: ${streamPath}`);
  });

  nms.on('donePublish', (id, streamPath, args) => {
    console.log(`[NodeEvent on donePublish] Stream ended: ${streamPath}`);
  });
    console.log('🎥 RTMP + HLS media server is running...');
  };

module.exports = startNodeMediaServer;
