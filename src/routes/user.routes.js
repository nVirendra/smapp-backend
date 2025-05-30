const express = require('express');
const {
  getUserProfile,
  followUser,
  unfollowUser,
  searchUsers,
} = require('../controllers/user.controller');

const router = express.Router();

router.get('/', searchUsers); // GET /api/users?search=xyz
router.get('/:id', getUserProfile);
router.post('/:id/follow', followUser);
router.post('/:id/unfollow', unfollowUser);

module.exports = router;
