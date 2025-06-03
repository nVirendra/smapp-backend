const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const convertToHLS = (inputFilePath, outputDir, streamKey) => {
  // Ensure outputDir is correct and doesn't have full absolute path appended again
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'index.m3u8');

  console.log(`🎥 Converting chunk for stream ${streamKey}`);
  console.log(`Input: ${inputFilePath}`);
  console.log(`Output: ${outputPath}`);

  const command = ffmpeg(inputFilePath)
    .addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-ac 1',
      '-strict -2',
      '-crf 20',
      '-profile:v baseline',
      '-maxrate 400k',
      '-bufsize 1835k',
      '-pix_fmt yuv420p',
      '-hls_time 4',
      '-hls_list_size 5',
      '-hls_wrap 10',
      '-hls_delete_threshold 1',
      '-hls_flags delete_segments',
    ])
    .output(outputPath)
    .on('start', (cmd) => console.log('FFmpeg started:', cmd))
    .on('error', (err, stdout, stderr) => {
      console.error('FFmpeg error:', err.message);
      console.error('FFmpeg stderr:', stderr);
    })
    .on('end', () => console.log('✅ FFmpeg finished conversion for', streamKey));

  command.run();
};

module.exports = { convertToHLS };
