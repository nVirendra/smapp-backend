const crypto = require('crypto');

const Stream = require('../models/Stream');


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



const chunkStream = async (req, res) => {
  
       try {
        const { streamKey, timestamp } = req.body;
        const videoChunk = req.file;
        
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
        
        // Get stream data
        const streamData = activeStreams.get(streamKey);
        if (!streamData) {
            return res.status(404).json({
                success: false,
                message: 'Stream not found'
            });
        }
        
        // Verify stream ownership
        if (streamData.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to stream'
            });
        }
        
        // Check if stream is live
        if (!streamData.isLive) {
            return res.status(400).json({
                success: false,
                message: 'Stream is not live'
            });
        }
        
        console.log(`Received chunk for stream ${streamKey}, size: ${videoChunk.size} bytes`);
        
        // Update chunk count
        streamData.chunkCount++;
        streamData.lastChunkAt = new Date();
        
        // Process the video chunk
        await processVideoChunk(streamKey, videoChunk, streamData);
        
        res.json({
            success: true,
            message: 'Chunk processed successfully',
            chunkNumber: streamData.chunkCount,
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


// 8. VIDEO CHUNK PROCESSING FUNCTION
// ============================================================================

const processVideoChunk = async (streamKey, videoChunk, streamData) => {
    try {
        const { hlsDir } = streamData;
        const chunkFilename = `chunk_${streamData.chunkCount}_${Date.now()}.webm`;
        const chunkPath = path.join(hlsDir, chunkFilename);
        
        // Save chunk to disk
        await fs.writeFile(chunkPath, videoChunk.buffer);
        
        // Initialize FFmpeg process for this stream if not exists
        if (!streamProcesses.has(streamKey)) {
            await initializeStreamProcess(streamKey, streamData);
        }
        
        // Convert WebM chunk to TS segment
        await convertChunkToHLS(streamKey, chunkPath, streamData);
        
        // Update playlist
        await updateHLSPlaylist(streamKey, streamData);
        
        // Clean up old chunk file
        setTimeout(() => {
            fs.unlink(chunkPath).catch(console.error);
        }, 10000); // Delete after 10 seconds
        
    } catch (error) {
        console.error('Video chunk processing error:', error);
        throw error;
    }
};

// 9. HLS STREAM PROCESSING
// ============================================================================

const initializeStreamProcess = async (streamKey, streamData) => {
    const { hlsDir } = streamData;
    
    try {
        // Create initial playlist
        const playlistPath = path.join(hlsDir, 'playlist.m3u8');
        const initialPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:EVENT
`;
        
        await fs.writeFile(playlistPath, initialPlaylist);
        
        // Store process info
        streamProcesses.set(streamKey, {
            segmentIndex: 0,
            playlistPath,
            segments: []
        });
        
        console.log(`Initialized HLS process for stream: ${streamKey}`);
        
    } catch (error) {
        console.error('Failed to initialize stream process:', error);
        throw error;
    }
};

const convertChunkToHLS = async (streamKey, chunkPath, streamData) => {
    return new Promise((resolve, reject) => {
        const processInfo = streamProcesses.get(streamKey);
        const segmentIndex = processInfo.segmentIndex++;
        const segmentFilename = `segment_${segmentIndex}.ts`;
        const segmentPath = path.join(streamData.hlsDir, segmentFilename);
        
        ffmpeg(chunkPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .format('mpegts')
            .outputOptions([
                '-preset fast',
                '-tune zerolatency',
                '-g 30',
                '-sc_threshold 0',
                '-f mpegts'
            ])
            .output(segmentPath)
            .on('end', () => {
                console.log(`Converted chunk to segment: ${segmentFilename}`);
                
                // Add segment to process info
                processInfo.segments.push({
                    filename: segmentFilename,
                    path: segmentPath,
                    index: segmentIndex,
                    duration: 2.0, // Approximate duration
                    timestamp: Date.now()
                });
                
                // Keep only last 10 segments
                if (processInfo.segments.length > 10) {
                    const oldSegment = processInfo.segments.shift();
                    fs.unlink(oldSegment.path).catch(console.error);
                }
                
                resolve();
            })
            .on('error', (err) => {
                console.error('FFmpeg conversion error:', err);
                reject(err);
            })
            .run();
    });
};

const updateHLSPlaylist = async (streamKey, streamData) => {
    try {
        const processInfo = streamProcesses.get(streamKey);
        const { playlistPath, segments } = processInfo;
        
        // Generate playlist content
        let playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:${Math.max(0, processInfo.segmentIndex - segments.length)}
`;
        
        // Add segments
        segments.forEach(segment => {
            playlist += `#EXTINF:${segment.duration.toFixed(1)},\n`;
            playlist += `${segment.filename}\n`;
        });
        
        // Write updated playlist
        await fs.writeFile(playlistPath, playlist);
        
        console.log(`Updated HLS playlist for stream: ${streamKey}, segments: ${segments.length}`);
        
    } catch (error) {
        console.error('Failed to update HLS playlist:', error);
        throw error;
    }
};

// ============================================================================
// 10. HLS SERVING ENDPOINTS
// ============================================================================

// // Serve HLS playlist
// app.get('/api/streams/:streamKey/hls/playlist.m3u8', (req, res) => {
//     const { streamKey } = req.params;
//     const streamData = activeStreams.get(streamKey);
    
//     if (!streamData) {
//         return res.status(404).json({ message: 'Stream not found' });
//     }
    
//     const playlistPath = path.join(streamData.hlsDir, 'playlist.m3u8');
    
//     res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
//     res.setHeader('Cache-Control', 'no-cache');
    
//     res.sendFile(playlistPath);
// });

// // Serve HLS segments
// app.get('/api/streams/:streamKey/hls/:segment', (req, res) => {
//     const { streamKey, segment } = req.params;
//     const streamData = activeStreams.get(streamKey);
    
//     if (!streamData) {
//         return res.status(404).json({ message: 'Stream not found' });
//     }
    
//     const segmentPath = path.join(streamData.hlsDir, segment);
    
//     res.setHeader('Content-Type', 'video/mp2t');
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Cache-Control', 'max-age=10');
    
//     res.sendFile(segmentPath);
// });


// // 12. CLEANUP FUNCTIONS
// // ============================================================================

// const cleanupStreamProcess = async (streamKey) => {
//     try {
//         // Remove from active streams
//         const streamData = activeStreams.get(streamKey);
//         if (streamData) {
//             // Cleanup files after some time
//             setTimeout(async () => {
//                 try {
//                     await fs.remove(streamData.streamDir);
//                     console.log(`Cleaned up stream directory: ${streamData.streamDir}`);
//                 } catch (error) {
//                     console.error('Cleanup error:', error);
//                 }
//             }, 60000); // Wait 1 minute before cleanup
//         }
        
//         // Remove process info
//         streamProcesses.delete(streamKey);
//         streamWriters.delete(streamKey);
        
//         console.log(`Cleaned up stream process: ${streamKey}`);
        
//     } catch (error) {
//         console.error('Cleanup error:', error);
//     }
// };

// // ============================================================================
// // 13. WEBSOCKET FOR REAL-TIME UPDATES
// // ============================================================================

// const wss = new WebSocket.Server({ port: 8080 });

// wss.on('connection', (ws) => {
//     console.log('WebSocket client connected');
    
//     ws.on('message', (message) => {
//         try {
//             const data = JSON.parse(message);
            
//             if (data.type === 'subscribe' && data.streamKey) {
//                 ws.streamKey = data.streamKey;
//                 console.log(`Client subscribed to stream: ${data.streamKey}`);
//             }
//         } catch (error) {
//             console.error('WebSocket message error:', error);
//         }
//     });
    
//     ws.on('close', () => {
//         console.log('WebSocket client disconnected');
//     });
// });

// // Broadcast stream updates
// const broadcastStreamUpdate = (streamKey, update) => {
//     wss.clients.forEach((client) => {
//         if (client.streamKey === streamKey && client.readyState === WebSocket.OPEN) {
//             client.send(JSON.stringify({
//                 type: 'streamUpdate',
//                 streamKey,
//                 ...update
//             }));
//         }
//     });
// };



module.exports = { createStream,startStream,getLiveStreams,getMytreams,getStreamByID,endStream ,chunkStream};
