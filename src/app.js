const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const streamRoutes = require('./routes/stream.routes.js');
const NodeMediaServer = require('node-media-server');
const listEndpoints = require('express-list-endpoints');
//const RTMPStreamServer = require('./rtmp-server');



dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RTMP Server Configuration
const nmsConfig = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        mediaroot: './media',
        allow_origin: '*'
    }
};

// Start RTMP Server
const nms = new NodeMediaServer(nmsConfig);
nms.run();



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

console.log(listEndpoints(app));

module.exports = app;
