const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Credentials  = require('../config/Credentials.js');

// Set FFmpeg and FFprobe paths - try to use installer, fallback to system FFmpeg
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  // FFprobe is usually in the same directory as ffmpeg
  const ffprobePath = ffmpegInstaller.path.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe');
  if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
  logger.info('FFmpeg path set from @ffmpeg-installer/ffmpeg');
} catch (err) {
  // If installer is not available, try to use system FFmpeg
  // You can also set FFMPEG_PATH and FFPROBE_PATH environment variables
  if (Credentials.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(Credentials.FFMPEG_PATH);
    logger.info('FFmpeg path set from FFMPEG_PATH environment variable');
  }
  if (Credentials.FFPROBE_PATH) {
    ffmpeg.setFfprobePath(Credentials.FFPROBE_PATH);
    logger.info('FFprobe path set from FFPROBE_PATH environment variable');
  }
  if (!Credentials.FFMPEG_PATH && !Credentials.FFPROBE_PATH) {
    logger.warn('FFmpeg installer not found. Using system FFmpeg if available.');
  }
}

const UPLOAD_DIR_ORDERS = Credentials.UPLOAD_DIR_ORDERS;

/**
 * Extract thumbnail from video at a specific time (in seconds)
 * @param {string} videoPath - Full path to the video file
 * @param {string} outputPath - Full path where thumbnail should be saved
 * @param {number} timeInSeconds - Time in seconds to extract frame (default: 1)
 * @returns {Promise<string>} Path to the generated thumbnail
 */
async function extractThumbnail(videoPath, outputPath, timeInSeconds = 1) {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timeInSeconds],
        filename: path.basename(outputPath),
        folder: outputDir,
        size: '1280x720' // Max size, maintains aspect ratio
      })
      .on('end', () => {
        logger.info(`Thumbnail extracted successfully: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`Error extracting thumbnail: ${err.message}`);
        reject(err);
      });
  });
}

/**
 * Get video duration in seconds
 * @param {string} videoPath - Full path to the video file
 * @returns {Promise<number>} Duration in seconds
 */
async function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error(`Error getting video duration: ${err.message}`);
        reject(err);
        return;
      }
      const duration = metadata.format.duration || 0;
      resolve(duration);
    });
  });
}

/**
 * Extract thumbnail for a video in an order
 * @param {string} orderId - Order ID
 * @param {string} videoFilename - Video filename
 * @param {number} timeInSeconds - Time in seconds to extract frame (default: 1)
 * @returns {Promise<{thumbnailPath: string, thumbnailUrl: string}>}
 */
async function extractOrderVideoThumbnail(orderId, videoFilename, timeInSeconds = 1) {
  const videoPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, videoFilename);
  
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  // Generate thumbnail filename
  const videoNameWithoutExt = path.parse(videoFilename).name;
  const thumbnailFilename = `thumb-${videoNameWithoutExt}-${Date.now()}.jpg`;
  const thumbnailPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, thumbnailFilename);
  
  // Extract thumbnail
  await extractThumbnail(videoPath, thumbnailPath, timeInSeconds);
  
  // Generate URL path
  const thumbnailUrl = `/${UPLOAD_DIR_ORDERS.replace(/^[.\\/]+/, "")}/${orderId}/${thumbnailFilename}`;
  
  return {
    thumbnailPath,
    thumbnailUrl,
    thumbnailFilename
  };
}

module.exports = {
  extractThumbnail,
  getVideoDuration,
  extractOrderVideoThumbnail
};

