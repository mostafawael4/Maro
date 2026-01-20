const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');
const Credentials = require('../config/Credentials.js');

// Import B2 service
let b2Service = null;
try {
  b2Service = require('./b2.service');
} catch (err) {
  logger.warn('B2 service not available');
}

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

// Detect Firebase environment
const IS_FIREBASE = process.env.FUNCTION_TARGET || process.env.K_SERVICE;

/**
 * Generate B2 public URL from file path
 * @param {string} filePath - B2 file path (e.g., "orders/123/file.jpg")
 * @returns {string} Full B2 public URL
 */
function getB2PublicUrl(filePath) {
  const bucketId = Credentials.B2_BUCKET_ID;
  if (!bucketId) {
    throw new Error('B2_BUCKET_ID not configured');
  }
  // Default B2 S3-compatible endpoint format
  // Adjust region if your bucket is in a different region
  const b2Url = `https://f${bucketId}.s3.us-west-000.backblazeb2.com/${filePath}`;
  // If you have a custom domain configured in B2, use it instead:
  // const b2Url = `https://your-custom-domain.com/${filePath}`;
  return b2Url;
}

/**
 * Download file from URL to local path
 * @param {string} url - File URL to download
 * @param {string} destPath - Local destination path
 * @returns {Promise<void>}
 */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        logger.info(`File downloaded from ${url} to ${destPath}`);
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

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
 * On Firebase: Downloads video from B2, processes in /tmp, uploads thumbnail to B2
 * On local dev: Processes video from local filesystem
 * 
 * @param {string} orderId - Order ID
 * @param {string} videoFilename - Video filename
 * @param {number} timeInSeconds - Time in seconds to extract frame (default: 1)
 * @returns {Promise<{thumbnailPath: string, thumbnailUrl: string, thumbnailFilename: string}>}
 */
async function extractOrderVideoThumbnail(orderId, videoFilename, timeInSeconds = 1) {
  // Generate thumbnail filename
  const videoNameWithoutExt = path.parse(videoFilename).name;
  const thumbnailFilename = `thumb-${videoNameWithoutExt}-${Date.now()}.jpg`;
  
  let videoPath;
  let thumbnailPath;
  let needsCleanup = false; // Track if we need to clean up /tmp files

  try {
    if (IS_FIREBASE) {
      // On Firebase, video is stored in B2
      if (!b2Service || !Credentials.B2_APPLICATION_KEY_ID) {
        throw new Error('B2 service required on Firebase Functions. Please configure B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET_ID environment variables.');
      }

      // Construct B2 file path and URL
      const videoB2Path = `orders/${orderId}/${videoFilename}`;
      const videoB2Url = getB2PublicUrl(videoB2Path);
      
      logger.info(`Downloading video from B2: ${videoB2Url}`);

      // Download video to /tmp
      const tmpDir = path.join(os.tmpdir(), 'maro-thumbnails', orderId);
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      
      videoPath = path.join(tmpDir, videoFilename);
      thumbnailPath = path.join(tmpDir, thumbnailFilename);
      
      // Download video from B2
      await downloadFile(videoB2Url, videoPath);
      needsCleanup = true;
      
      logger.info(`Video downloaded to ${videoPath}`);
    } else {
      // Local development - use local filesystem
      videoPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, videoFilename);
      
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }
      
      thumbnailPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, thumbnailFilename);
    }

    // Extract thumbnail using FFmpeg
    logger.info(`Extracting thumbnail from ${videoPath}`);
    await extractThumbnail(videoPath, thumbnailPath, timeInSeconds);

    if (IS_FIREBASE) {
      // On Firebase, upload thumbnail to B2
      logger.info(`Uploading thumbnail to B2`);
      
      // Read thumbnail file
      const thumbnailBuffer = fs.readFileSync(thumbnailPath);
      
      // Construct B2 path for thumbnail
      const thumbnailB2Path = `orders/${orderId}/${thumbnailFilename}`;
      
      // Upload to B2
      await b2Service.upload(thumbnailB2Path, thumbnailBuffer);
      
      // Get B2 public URL for thumbnail
      const thumbnailUrl = getB2PublicUrl(thumbnailB2Path);
      
      logger.info(`Thumbnail uploaded to B2: ${thumbnailUrl}`);
      
      // Clean up /tmp files
      try {
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
          logger.info(`Cleaned up video file: ${videoPath}`);
        }
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          logger.info(`Cleaned up thumbnail file: ${thumbnailPath}`);
        }
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up /tmp files: ${cleanupErr.message}`);
      }
      
      return {
        thumbnailPath: thumbnailB2Path, // B2 path for reference
        thumbnailUrl, // Full B2 URL
        thumbnailFilename
      };
    } else {
      // Local development - return local path
      const thumbnailUrl = `/${UPLOAD_DIR_ORDERS.replace(/^[.\\/]+/, "")}/${orderId}/${thumbnailFilename}`;
      
      return {
        thumbnailPath, // Local file path
        thumbnailUrl, // Relative URL path
        thumbnailFilename
      };
    }
  } catch (err) {
    // Clean up /tmp files on error (Firebase only)
    if (needsCleanup && IS_FIREBASE) {
      try {
        if (videoPath && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
        }
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up /tmp files after error: ${cleanupErr.message}`);
      }
    }
    
    logger.error(`Failed to extract thumbnail: ${err.message}`);
    throw err;
  }
}

module.exports = {
  extractThumbnail,
  getVideoDuration,
  extractOrderVideoThumbnail
};