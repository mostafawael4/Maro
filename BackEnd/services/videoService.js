import Credentials from '../config/Credentials.js';
import { extractOrderVideoThumbnail, getVideoDuration } from './videoThumbnail.service.js';
import Order from '../models/order.js'; // Adjust as needed
import path from 'path';
import fs from 'fs';

export async function getVideoDurationService(orderId, filename) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const videoFile = order.media.find(m => m.filename === filename);
  if (!videoFile) throw new Error('Video not found in order');

  const UPLOAD_DIR_ORDERS = Credentials.UPLOAD_DIR_ORDERS || "./uploads/orders";
  const videoPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, filename);

  let ffmpegInput = videoPath;
  if (!fs.existsSync(videoPath)) {
    // Use B2 signed URL
    const b2Service = (await import('./b2.service.js')).default;
    ffmpegInput = await b2Service.getNativePresignedUrl(`orders/${orderId}/${filename}`);
  }

  return await getVideoDuration(ffmpegInput);
}

export async function extractThumbnailService(orderId, filename, timeInSeconds = 1) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const videoFile = order.media.find(m => m.filename === filename);
  if (!videoFile) throw new Error('Video not found in order');

  return await extractOrderVideoThumbnail(orderId, filename, timeInSeconds);
}

// Service to extract a thumbnail for films (not order videos)
import Film from '../models/Film.js';
import { extractThumbnail, streamingExtractThumbnail } from './videoThumbnail.service.js';
import logger from '../utils/logger.js';

/**
 * Extracts and saves a thumbnail for a given film.
 * @param {string} filmId - The MongoDB ObjectId of the film.
 * @param {string} filename - The film filename.
 * @param {number} timeInSeconds - The time in seconds to extract the thumbnail (default: 1).
 * @returns {Promise<{ thumbnailUrl: string, thumbnailFilename: string }>}
 */
export async function extractThumbnailForFilmsService(filmId, filename, timeInSeconds = 1) {
  // Lookup film
  const film = await Film.findById(filmId);
  if (!film) throw new Error('Film not found');

  // Determine path to video file
  const UPLOAD_DIR_FILMS = Credentials.UPLOAD_DIR_FILMS || "./uploads/films";
  const filmPath = path.resolve(UPLOAD_DIR_FILMS, filename);

  // Compose a unique thumbnail filename
  const thumbBase = path.basename(filename, path.extname(filename));
  const thumbnailFilename = `${thumbBase}_thumb_${Date.now()}.jpg`;
  const tempThumbPath = path.resolve('tmp', thumbnailFilename);

  try {
    if (fs.existsSync(filmPath)) {
      // Film exists locally, use direct extraction
      logger.info(`Film found locally, extracting thumbnail: ${filmPath}`);
      await extractThumbnail(filmPath, tempThumbPath, timeInSeconds);
    } else {
      // Film is remote, use streaming approach to avoid downloading entire file
      logger.info(`Film not found locally, using streaming extraction from B2: films/${filename}`);
      const b2Service = (await import('./b2.service.js')).default;
      const streamUrl = await b2Service.getNativePresignedUrl(`films/${filename}`);
      await streamingExtractThumbnail(streamUrl, tempThumbPath, timeInSeconds);
    }

    // Upload to B2
    const b2Service = (await import('./b2.service.js')).default;
    const thumbBuffer = fs.readFileSync(tempThumbPath);
    await b2Service.upload(`films/${thumbnailFilename}`, thumbBuffer);

    // Construct B2 URL (unsigned, route will sign it)
    const thumbnailUrl = ``;

    // Return both thumbnail URL and filename for saving in the DB
    return {
      thumbnailUrl,
      thumbnailFilename: thumbnailFilename,
    };
  } finally {
    // Cleanup local thumbnail
    if (fs.existsSync(tempThumbPath)) {
      fs.unlinkSync(tempThumbPath);
      logger.info(`Cleaned up temp thumbnail: ${tempThumbPath}`);
    }
  }
}

