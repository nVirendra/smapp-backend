// rtmp-server.js
const NodeRtmpServer = require('node-rtmp-server');
const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class RTMPStreamServer {
    constructor(options = {}) {
        this.port = options.port || 1935;
        this.activeStreams = new Map();
        this.streamProcesses = new Map();
        
        this.config = {
            rtmp: {
                port: this.port,
                chunk_size: 60000,
                gop_cache: true,
                ping: 30,
                ping_timeout: 60
            },
            http: {
                port: 8000,
                allow_origin: '*'
            }
        };
    }

    start() {
        const nrs = new NodeRtmpServer(this.config);
        
        // Handle new publisher (streamer)
        nrs.on('preConnect', (id, args) => {
            console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        nrs.on('postConnect', (id, args) => {
            console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        nrs.on('doneConnect', (id, args) => {
            console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
        });

        nrs.on('prePublish', (id, StreamPath, args) => {
            console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
            
            // Extract stream key from path
            const streamKey = StreamPath.split('/').pop();
            
            // Validate stream key here
            if (!this.validateStreamKey(streamKey)) {
                console.log(`Invalid stream key: ${streamKey}`);
                return false; // Reject the stream
            }
            
            return true; // Allow the stream
        });

        nrs.on('postPublish', (id, StreamPath, args) => {
            console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
            
            const streamKey = StreamPath.split('/').pop();
            this.startStreamProcessing(id, streamKey);
        });

        nrs.on('donePublish', (id, StreamPath, args) => {
            console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
            
            const streamKey = StreamPath.split('/').pop();
            this.stopStreamProcessing(id, streamKey);
        });

        nrs.on('prePlay', (id, StreamPath, args) => {
            console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
            return true;
        });

        nrs.on('postPlay', (id, StreamPath, args) => {
            console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        });

        nrs.on('donePlay', (id, StreamPath, args) => {
            console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
        });

        nrs.run();
        console.log(`🎥 RTMP Server started on port ${this.port}`);
    }

    validateStreamKey(streamKey) {
        // In production, validate against your database
        // For now, accept any stream key that matches the pattern
        return streamKey && streamKey.startsWith('stream_');
    }

    async startStreamProcessing(sessionId, streamKey) {
        try {
            console.log(`Starting stream processing for: ${streamKey}`);
            
            // Create directories
            const streamDir = path.join(__dirname, 'streams', streamKey);
            const hlsDir = path.join(streamDir, 'hls');
            await fs.ensureDir(hlsDir);
            
            // Store stream info
            this.activeStreams.set(streamKey, {
                sessionId,
                streamKey,
                startTime: new Date(),
                streamDir,
                hlsDir,
                segmentIndex: 0
            });
            
            // Start FFmpeg process to convert RTMP to HLS
            this.startHLSConversion(streamKey);
            
        } catch (error) {
            console.error('Stream processing error:', error);
        }
    }

    startHLSConversion(streamKey) {
        const streamInfo = this.activeStreams.get(streamKey);
        if (!streamInfo) return;
        
        const inputUrl = `rtmp://localhost:${this.port}/live/${streamKey}`;
        const outputPath = path.join(streamInfo.hlsDir, 'playlist.m3u8');
        const segmentPath = path.join(streamInfo.hlsDir, 'segment_%03d.ts');
        
        const ffmpegProcess = ffmpeg(inputUrl)
            .addOptions([
                '-c:v libx264',
                '-c:a aac',
                '-preset veryfast',
                '-tune zerolatency',
                '-g 30',
                '-sc_threshold 0',
                '-f hls',
                '-hls_time 2',
                '-hls_list_size 10',
                '-hls_flags delete_segments',
                '-hls_segment_filename', segmentPath
            ])
            .output(outputPath)
            .on('start', (commandLine) => {
                console.log(`FFmpeg started for ${streamKey}: ${commandLine}`);
            })
            .on('end', () => {
                console.log(`FFmpeg finished for ${streamKey}`);
                this.cleanupStream(streamKey);
            })
            .on('error', (err) => {
                console.error(`FFmpeg error for ${streamKey}:`, err);
                this.cleanupStream(streamKey);
            });
        
        // Store process reference
        this.streamProcesses.set(streamKey, ffmpegProcess);
        
        // Start the process
        ffmpegProcess.run();
    }

    stopStreamProcessing(sessionId, streamKey) {
        console.log(`Stopping stream processing for: ${streamKey}`);
        
        // Stop FFmpeg process
        const ffmpegProcess = this.streamProcesses.get(streamKey);
        if (ffmpegProcess) {
            ffmpegProcess.kill('SIGTERM');
            this.streamProcesses.delete(streamKey);
        }
        
        // Clean up stream info
        this.cleanupStream(streamKey);
    }

    async cleanupStream(streamKey) {
        try {
            const streamInfo = this.activeStreams.get(streamKey);
            if (streamInfo) {
                // Cleanup files after some delay
                setTimeout(async () => {
                    try {
                        await fs.remove(streamInfo.streamDir);
                        console.log(`Cleaned up stream directory: ${streamInfo.streamDir}`);
                    } catch (error) {
                        console.error('Cleanup error:', error);
                    }
                }, 60000); // Wait 1 minute
                
                this.activeStreams.delete(streamKey);
            }
        } catch (error) {
            console.error('Stream cleanup error:', error);
        }
    }

    getActiveStreams() {
        return Array.from(this.activeStreams.values());
    }

    getStreamInfo(streamKey) {
        return this.activeStreams.get(streamKey);
    }
}

// Export for use in main application
module.exports = RTMPStreamServer;

// If running directly, start the server
if (require.main === module) {
    const rtmpServer = new RTMPStreamServer({
        port: 1935
    });
    
    rtmpServer.start();
}