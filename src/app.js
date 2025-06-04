const express = require('express');
const cors = require('cors');
const path = require('path');

const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const streamRoutes = require('./routes/stream.routes.js');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/live', express.static(path.join(__dirname, 'media', 'live')));


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
