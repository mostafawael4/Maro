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
const systemFfmpegPath = 'ffmpeg'; // Default system command
const systemFfprobePath = 'ffprobe';

// Check if system ffmpeg is available (simple check by assuming it's in PATH or using a known path if needed, 
// but fluent-ffmpeg defaults to PATH. We just need to NOT overwrite it with the incompatible installer if unnecessary).

// However, fluent-ffmpeg needs an explicit path often if not in standard locations or to be sure.
// We will try to detect if we are in production/docker where we expect 'ffmpeg' to be in path.

// Priority:
// 1. Environment variables (FFMPEG_PATH)
// 2. @ffmpeg-installer (only if we are NOT in an environment where we want to force system, or as fallback)
// ACTUALLY: The issue is @ffmpeg-installer overwriting the valid system one.

if (Credentials.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(Credentials.FFMPEG_PATH);
    logger.info('FFmpeg path set from FFMPEG_PATH environment variable');
} else {
    // Try to rely on system ffmpeg first (common in Docker Alpine)
    // We can assume if it's in the PATH, fluent-ffmpeg finds it. 
    // But to be safe and explicit:
    
    // In the Dockerfile we installed it, so it should be at /usr/bin/ffmpeg or similar.
    // Let's check for specific known alpine path or just let it be if we don't set it?
    // The previous code ALWAYS set it from installer.
    
    // Logic: If @ffmpeg-installer is present, it's used. We want to SKIP that if we are on Alpine.
    // We can detect Alpine or just prefer system.
    
    // Let's try to verify if 'ffmpeg' command works? No that's async/complex here.
    
    // Better strategy: Use @ffmpeg-installer ONLY if not in Docker/Production or if explicitly requested.
    // Or simpler: Just try to set it, but log what we are doing.
    
    // PROPOSED CHANGE: 
    // valid path for alpine 'apk add ffmpeg' is usually /usr/bin/ffmpeg
    if (fs.existsSync('/usr/bin/ffmpeg')) {
        ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
        logger.info('FFmpeg path set to system binary: /usr/bin/ffmpeg');
        
        if (fs.existsSync('/usr/bin/ffprobe')) {
            ffmpeg.setFfprobePath('/usr/bin/ffprobe');
        }
    } else if (ffmpegInstaller && ffmpegInstaller.path) {
        // Fallback to the npm package (local dev on Windows/Mac usually)
        ffmpeg.setFfmpegPath(ffmpegInstaller.path);
        const ffprobePath = ffmpegInstaller.path.replace('ffmpeg.exe', 'ffprobe.exe').replace('ffmpeg', 'ffprobe');
        if (fs.existsSync(ffprobePath)) {
            ffmpeg.setFfprobePath(ffprobePath);
        }
        logger.info('FFmpeg path set from @ffmpeg-installer/ffmpeg');
    } else {
        logger.warn('No FFmpeg path explicitly set. Relying on system PATH.');
    }
}

if (Credentials.FFPROBE_PATH) {
    ffmpeg.setFfprobePath(Credentials.FFPROBE_PATH);
    logger.info('FFprobe path set from FFPROBE_PATH environment variable');
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
      .on('error', (err, stdout, stderr) => {
        logger.error(`Error extracting thumbnail from ${videoPath}: ${err.message}`);
        if (stderr) {
            logger.error(`FFmpeg stderr: ${stderr}`);
        }
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
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    logger.info(`Starting streaming thumbnail extraction from URL at ${timeInSeconds}s`);

    // Pass URL directly to ffmpeg
    ffmpeg(videoUrl)
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
      .on('error', (err, stdout, stderr) => {
        logger.error(`Error extracting thumbnail from stream: ${err.message}`);
        if (stderr) logger.error(`FFmpeg stderr: ${stderr}`);
        reject(err);
      });
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

  // Generate thumbnail filename
  const thumbName = `thumb-${Date.now()}-${videoFilename}.jpg`;
  const tempThumbPath = path.resolve('tmp', thumbName);

  try {
    // Video is remote, use streaming approach to avoid downloading entire file
    logger.info(`Using streaming extraction from B2: ${videoKey}`);
    const streamUrl = await b2.getNativePresignedUrl(videoKey);
    await streamingExtractThumbnail(streamUrl, tempThumbPath, timeInSeconds);

    // Upload extracted thumbnail to B2
    const thumbBuffer = fs.readFileSync(tempThumbPath);
    const thumbKey = `orders/${orderId}/${thumbName}`;

    logger.info(`Uploading thumbnail to B2: ${thumbKey}`);
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
