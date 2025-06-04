const Stream = require('../models/Stream');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);



const generateStreamKey = () => {
    return crypto.randomBytes(16).toString('hex');
};

// Create new stream
const createStream = async (req, res) => {
  try {
        const { title, description } = req.body;
        
        if (!title) {
            return res.status(400).json({ message: 'Title is required' });
        }

        // Generate unique stream key
        let streamKey;
        let isUnique = false;
        
        while (!isUnique) {
            streamKey = generateStreamKey();
            const existingStream = await Stream.findOne({ streamKey });
            if (!existingStream) {
                isUnique = true;
            }
        }

        // Create RTMP URL (replace with your server domain)
        const SERVER_DOMAIN = process.env.SERVER_DOMAIN || 'localhost';
        const rtmpUrl = `rtmp://${SERVER_DOMAIN}:1935/live/${streamKey}`;
        const playbackUrl = `http://${SERVER_DOMAIN}:8000/live/${streamKey}/index.m3u8`;

        const newStream = new Stream({
            user: req.user._id,
            title,
            description,
            streamKey,
            rtmpUrl,
            playbackUrl,
            status: 'scheduled'
        });

        await newStream.save();

        res.status(201).json({
            streamId: newStream._id,
            title: newStream.title,
            streamKey: newStream.streamKey,
            rtmpUrl: newStream.rtmpUrl,
            playbackUrl: newStream.playbackUrl,
            status: newStream.status
        });

    } catch (error) {
        console.error('Create stream error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const startStream = async (req, res) => {
  try {
        const stream = await Stream.findById(req.params.streamId);
        
        if (!stream) {
            return res.status(404).json({ message: 'Stream not found' });
        }

        if (stream.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        stream.status = 'live';
        stream.startedAt = new Date();
        await stream.save();

        res.json({
            message: 'Stream started successfully',
            stream: {
                id: stream._id,
                status: stream.status,
                startedAt: stream.startedAt
            }
        });

    } catch (error) {
        console.error('Start stream error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const endStream = async (req, res) => {
  try {
        const stream = await Stream.findById(req.params.streamId);
        
        if (!stream) {
            return res.status(404).json({ message: 'Stream not found' });
        }

        if (stream.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        stream.status = 'ended';
        await stream.save();

        res.json({
            message: 'Stream started successfully',
            stream: {
                id: stream._id,
                status: stream.status,
                startedAt: stream.startedAt
            }
        });

    } catch (error) {
        console.error('Start stream error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


const getLiveStreams = async (req, res) => {
 try {
        const liveStreams = await Stream.find({ status: 'live' })
            .populate('user', 'username profilePicture')
            .sort({ startedAt: -1 })
            .limit(20);

        res.json(liveStreams);

    } catch (error) {
        console.error('Get live streams error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getMytreams = async (req, res) => {
 try {
        const streams = await Stream.find({ user: req.user._id })
            .sort({ createdAt: -1 });

        res.json(streams);

    } catch (error) {
        console.error('Get my streams error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

const getStreamByID = async (req, res) => {
try {
        const stream = await Stream.findById(req.params.streamId)
            .populate('user', 'username profilePicture');

        if (!stream) {
            return res.status(404).json({ message: 'Stream not found' });
        }

        res.json(stream);

    } catch (error) {
        console.error('Get stream error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { createStream,startStream,getLiveStreams,getMytreams,getStreamByID,endStream};
