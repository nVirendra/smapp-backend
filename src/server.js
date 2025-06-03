const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { initNotificationSocket } = require('./sockets/notification.socket');
const connectDB = require('./config/database');
const startNodeMediaServer = require('./rtmp-server');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initNotificationSocket(io);
module.exports = { io };

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`RTMP server running on rtmp://localhost:1935/live`);
    console.log(
      `HLS streams available at http://localhost:8000/live/{stream_key}/index.m3u8`
    );
  });
});

startNodeMediaServer();
