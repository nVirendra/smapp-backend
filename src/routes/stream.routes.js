const express = require('express');
const {
  createStream,startStream,getLiveStreams,getMytreams,getStreamByID,endStream
} = require('../controllers/stream.controller');
const authenticate = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/create', authenticate, createStream);
router.put('/:streamId/start', authenticate, startStream);
router.get('/live', authenticate, getLiveStreams);
router.get('/my-streams', authenticate, getMytreams);
router.get('/:streamId', authenticate, getStreamByID);
router.put('/:streamId/end', authenticate, endStream);

// router.post('/:id/unfollow', unfollowUser);

module.exports = router;
