const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });



const {
  createStream,startStream,getLiveStreams,getMytreams,getStreamByID,endStream,chunkStream
} = require('../controllers/stream.controller');
const authenticate = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/create', authenticate, createStream);
router.put('/:streamId/start', authenticate, startStream);
router.get('/live', authenticate, getLiveStreams);
router.get('/my-streams', authenticate, getMytreams);
router.get('/:streamId', authenticate, getStreamByID);
router.put('/:streamId/end', authenticate, endStream);
router.post('/chunk', authenticate,upload.single('videoChunk'), chunkStream);

module.exports = router;
