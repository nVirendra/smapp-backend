const Stream = require('../models/Stream');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
// const  {convertToHLS}  = require('../utils/ffmpeg-utils'); // create this file if needed
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


// Store active FFmpeg processes
global.hlsProcesses = global.hlsProcesses || new Map();

const chunkStream = async (req, res) => {
    try {
        const streamKey = req.body?.streamKey;
        const timestamp = req.body?.timestamp;
        const videoChunk = req.file;

        if (!req.body) {
            return res.status(400).json({
                success: false,
                message: 'Form data not parsed'
            });
        }

        if (!videoChunk) {
            return res.status(400).json({
                success: false,
                message: 'No video chunk provided'
            });
        }

        if (!streamKey) {
            return res.status(400).json({
                success: false,
                message: 'Stream key is required'
            });
        }

        const streamData = await Stream.findOne({streamKey: streamKey});

        if (!streamData) {
            return res.status(404).json({
                success: false,
                message: 'Stream not found'
            });
        }

        if (streamData.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to stream'
            });
        }

        if (streamData.status !== 'live') {
            return res.status(400).json({
                success: false,
                message: 'Stream is not live'
            });
        }

        console.log(`✅ Received chunk for stream ${streamKey}, size: ${videoChunk.size} bytes`);

        // Create stream folder
        const streamFolder = path.join(__dirname, '../media', streamKey);
        if (!fs.existsSync(streamFolder)) {
            fs.mkdirSync(streamFolder, { recursive: true });
        }

        // Save chunk with sequential naming
        const chunkNumber = streamData.chunkCount || 0;
        const chunkFileName = `chunk-${String(chunkNumber).padStart(6, '0')}.webm`;
        const chunkFilePath = path.join(streamFolder, chunkFileName);

        fs.writeFileSync(chunkFilePath, videoChunk.buffer);

        // Initialize HLS conversion if this is the first chunk
        if (chunkNumber === 0) {
            await initializeHLSStream(streamKey, streamFolder);
        }

        // Process the chunk for HLS
        await processChunkForHLS(chunkFilePath, streamFolder, streamKey, chunkNumber);

        // Update stream data
        streamData.chunkCount = chunkNumber + 1;
        streamData.lastChunkAt = new Date();
        await streamData.save();

        res.json({
            success: true,
            message: 'Chunk processed successfully',
            chunkNumber: chunkNumber + 1,
            chunkSize: videoChunk.size,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Chunk processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process video chunk',
            error: error.message
        });
    }
};




// Initialize HLS stream
async function initializeHLSStream(streamKey, streamFolder) {
    const playlistPath = path.join(streamFolder, 'index.m3u8');
    
    // Create initial playlist
    const initialPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:EVENT
`;
    
    fs.writeFileSync(playlistPath, initialPlaylist);
    console.log(`📝 Created initial HLS playlist for ${streamKey}`);
}

// Process individual chunk for HLS
async function processChunkForHLS(chunkPath, streamFolder, streamKey, chunkNumber) {
    return new Promise((resolve, reject) => {
        const segmentName = `segment-${String(chunkNumber).padStart(6, '0')}.ts`;
        const segmentPath = path.join(streamFolder, segmentName);
        const playlistPath = path.join(streamFolder, 'index.m3u8');

        // Convert WebM chunk to TS segment
        ffmpeg(chunkPath)
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-ac 2',
                '-ar 44100',
                '-f mpegts',
                '-bsf:v h264_mp4toannexb',
                '-preset ultrafast',
                '-tune zerolatency'
            ])
            .output(segmentPath)
            .on('start', (commandLine) => {
                console.log(`🔄 Converting chunk ${chunkNumber}: ${commandLine}`);
            })
            .on('end', () => {
                console.log(`✅ Converted chunk ${chunkNumber} to TS segment`);
                
                // Update playlist
                updateHLSPlaylist(playlistPath, segmentName, chunkNumber);
                
                // Clean up original chunk
                fs.unlinkSync(chunkPath);
                
                resolve();
            })
            .on('error', (err) => {
                console.error(`❌ Error converting chunk ${chunkNumber}:`, err);
                reject(err);
            })
            .run();
    });
}

// Update HLS playlist
function updateHLSPlaylist(playlistPath, segmentName, chunkNumber) {
    try {
        let playlist = fs.readFileSync(playlistPath, 'utf8');
        
        // Add new segment to playlist
        const segmentDuration = 4.0; // Assume 4 second segments
        const newSegmentEntry = `#EXTINF:${segmentDuration},\n${segmentName}\n`;
        
        // Update media sequence number
        const mediaSeqRegex = /#EXT-X-MEDIA-SEQUENCE:(\d+)/;
        const currentSeq = playlist.match(mediaSeqRegex);
        if (currentSeq) {
            playlist = playlist.replace(mediaSeqRegex, `#EXT-X-MEDIA-SEQUENCE:${chunkNumber}`);
        }
        
        // Add new segment before the end
        if (playlist.includes('#EXT-X-ENDLIST')) {
            playlist = playlist.replace('#EXT-X-ENDLIST', newSegmentEntry + '#EXT-X-ENDLIST');
        } else {
            playlist += newSegmentEntry;
        }
        
        // Keep only last 10 segments in playlist (sliding window)
        const lines = playlist.split('\n');
        const segmentLines = [];
        const otherLines = [];
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF:')) {
                segmentLines.push(lines[i], lines[i + 1]);
                i++; // Skip next line as it's the segment name
            } else if (!lines[i].includes('.ts')) {
                otherLines.push(lines[i]);
            }
        }
        
        // Keep only last 10 segments
        const maxSegments = 10;
        const recentSegments = segmentLines.slice(-maxSegments * 2);
        
        // Rebuild playlist
        const headerLines = otherLines.filter(line => 
            line.startsWith('#') && !line.includes('#EXT-X-ENDLIST')
        );
        
        playlist = headerLines.join('\n') + '\n' + recentSegments.join('\n');
        if (!playlist.endsWith('\n')) playlist += '\n';
        
        fs.writeFileSync(playlistPath, playlist);
        console.log(`📝 Updated HLS playlist with segment ${chunkNumber}`);
        
    } catch (error) {
        console.error('Error updating HLS playlist:', error);
    }
}


module.exports = { createStream,startStream,getLiveStreams,getMytreams,getStreamByID,endStream ,chunkStream};
