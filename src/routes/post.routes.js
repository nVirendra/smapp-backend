const express = require('express');

const {
  createPost,
  getFeedPosts,
  likePost,
  commentOnPost,
  getUserPosts,
} = require('../controllers/post.controller');
const authenticate = require('../middlewares/auth.middleware');
const upload = require('../utils/upload');

const router = express.Router();

// Route to create a post with authentication and file upload
router.post('/', authenticate, upload.single('file'), createPost);

// Route to get feed posts with authentication
router.get('/feed', authenticate, getFeedPosts);

// Route to like a post with authentication
router.put('/like/:id', authenticate, likePost);

// Route to comment on a post with authentication
router.post('/comment/:id', authenticate, commentOnPost);

// Route to get posts by a specific user
router.get('/user/:userId', getUserPosts);

module.exports = router;
