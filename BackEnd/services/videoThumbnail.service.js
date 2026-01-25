import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import Credentials from '../config/Credentials.js';
import b2 from './b2.service.js';
import Order from '../models/order.js';
import axios from 'axios';

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set FFmpeg and FFprobe paths
if (ffmpegInstaller && ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  // FFprobe is usually in the same directory as ffmpeg
  const ffprobePath = ffmpegInstaller.path.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe');
  if (fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
  logger.info('FFmpeg path set from @ffmpeg-installer/ffmpeg');
} else {
  // Fallback to environment variables or system paths
  if (Credentials.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(Credentials.FFMPEG_PATH);
    logger.info('FFmpeg path set from FFMPEG_PATH environment variable');
  }
  if (Credentials.FFPROBE_PATH) {
    ffmpeg.setFfprobePath(Credentials.FFPROBE_PATH);
    logger.info('FFprobe path set from FFPROBE_PATH environment variable');
  }
  if (!Credentials.FFMPEG_PATH && !Credentials.FFPROBE_PATH) {
    logger.warn('FFmpeg installer path not found. Using system FFmpeg if available.');
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
export async function extractThumbnail(videoPath, outputPath, timeInSeconds = 1) {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const command = ffmpeg(videoPath)
      .screenshots({
        timestamps: [String(timeInSeconds)], // ensure it's a string/number FFmpeg likes
        filename: path.basename(outputPath),
        folder: outputDir,
        size: '1280x720' // Max size, maintains aspect ratio
      })
      .on('end', () => {
        logger.info(`Thumbnail extracted successfully: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`Error extracting thumbnail from ${videoPath}: ${err.message}`);
        reject(err);
      });
  });
}

/**
 * Extract thumbnail from streaming video URL without downloading entire file
 * @param {string} videoUrl - URL to stream the video from
 * @param {string} outputPath - Full path where thumbnail should be saved
 * @param {number} timeInSeconds - Time in seconds to extract frame (default: 1)
 * @returns {Promise<string>} Path to the generated thumbnail
 */
export async function streamingExtractThumbnail(videoUrl, outputPath, timeInSeconds = 1) {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      logger.info(`Starting streaming thumbnail extraction from URL at ${timeInSeconds}s`);

      // Use axios to stream video with range request - only get first 50MB
      const maxBytes = 50 * 1024 * 1024; // 50MB should be enough for most thumbnail extractions
      const response = await axios.get(videoUrl, {
        responseType: 'stream',
        headers: {
          'Range': `bytes=0-${maxBytes}`
        },
        timeout: 30000 // 30 second timeout
      });

      const command = ffmpeg()
        .input(response.data)
        .inputOptions([
          '-analyzeduration', '10000000',  // 10 seconds to analyze
          '-probesize', '10000000'         // 10MB probe size
        ])
        .screenshots({
          timestamps: [String(timeInSeconds)],
          filename: path.basename(outputPath),
          folder: outputDir,
          size: '1280x720'
        })
        .on('end', () => {
          logger.info(`Streaming thumbnail extracted successfully: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(`Error extracting thumbnail from stream: ${err.message}`);
          reject(err);
        });
    } catch (err) {
      logger.error(`Error setting up streaming extraction: ${err.message}`);
      reject(err);
    }
  });
}

/**
 * Get video duration in seconds
 * @param {string} videoPath - Full path to the video file
 * @returns {Promise<number>} Duration in seconds
 */
export async function getVideoDuration(videoPath) {
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
export async function extractOrderVideoThumbnail(orderId, videoFilename, timeInSeconds = 1) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const videoFile = order.media.find(m => m.filename === videoFilename);
  if (!videoFile) throw new Error('Video not found in order');

  const videoKey = `orders/${orderId}/${videoFilename}`;

  // Try local first if exists
  const localVideoPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, videoFilename);

  // Generate thumbnail filename
  const thumbName = `thumb-${Date.now()}-${videoFilename}.jpg`;
  const tempThumbPath = path.resolve('tmp', thumbName);

  try {
    if (fs.existsSync(localVideoPath)) {
      // Video exists locally, use direct extraction
      logger.info(`Video found locally, extracting thumbnail: ${localVideoPath}`);
      await extractThumbnail(localVideoPath, tempThumbPath, timeInSeconds);
    } else {
      // Video is remote, use streaming approach to avoid downloading entire file
      logger.info(`Video not found locally, using streaming extraction from B2: ${videoKey}`);
      const streamUrl = await b2.getPresignedUrl(videoKey);
      await streamingExtractThumbnail(streamUrl, tempThumbPath, timeInSeconds);
    }

    // Upload extracted thumbnail to B2
    const thumbBuffer = fs.readFileSync(tempThumbPath);
    const thumbKey = `orders/${orderId}/${thumbName}`;
    await b2.upload(thumbKey, thumbBuffer);

    // Construct B2 URL for the thumbnail
    const thumbnailUrl = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${thumbKey}`;

    return {
      thumbnailPath: tempThumbPath,
      thumbnailUrl,
      thumbnailFilename: thumbName
    };
  } finally {
    // Clean up temp thumbnail
    if (fs.existsSync(tempThumbPath)) {
      fs.unlinkSync(tempThumbPath);
      logger.info(`Cleaned up temp thumbnail: ${tempThumbPath}`);
    }
  }
}
