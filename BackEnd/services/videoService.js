const Credentials = require('../config/Credentials');
const { extractOrderVideoThumbnail, getVideoDuration } = require('./videoThumbnail.service');
const Order = require('../models/order'); // Adjust as needed
const path = require('path');
const fs = require('fs');

async function getVideoDurationService(orderId, filename) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const videoFile = order.media.find(m => m.filename === filename);
  if (!videoFile) throw new Error('Video not found in order');

  const UPLOAD_DIR_ORDERS = Credentials.UPLOAD_DIR_ORDERS || "./uploads/orders";
  const videoPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, filename);

  if (!fs.existsSync(videoPath)) throw new Error('Video file not found on server');

  return await getVideoDuration(videoPath);
}

async function extractThumbnailService(orderId, filename, timeInSeconds = 1) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const videoFile = order.media.find(m => m.filename === filename);
  if (!videoFile) throw new Error('Video not found in order');

  return await extractOrderVideoThumbnail(orderId, filename, timeInSeconds);
}

// Service to extract a thumbnail for films (not order videos)
const Film = require('../models/Film');
const { extractThumbnail } = require('./videoThumbnail.service'); // you must have this utility for generic videos

/**
 * Extracts and saves a thumbnail for a given film.
 * @param {string} filmId - The MongoDB ObjectId of the film.
 * @param {string} filename - The film filename.
 * @param {number} timeInSeconds - The time in seconds to extract the thumbnail (default: 1).
 * @returns {Promise<{ thumbnailUrl: string, thumbnailFilename: string }>}
 */
async function extractThumbnailForFilmsService(filmId, filename, timeInSeconds = 1) {
  // Lookup film
  const film = await Film.findById(filmId);
  if (!film) throw new Error('Film not found');

  // Determine path to video file
  const UPLOAD_DIR_FILMS = Credentials.UPLOAD_DIR_FILMS || "./uploads/films";
  const filmPath = path.resolve(UPLOAD_DIR_FILMS, filename);

  if (!fs.existsSync(filmPath)) throw new Error('Film video file not found on server');

  // Use extractThumbnail 
  // Compose a unique thumbnail filename
  const thumbBase = path.basename(filename, path.extname(filename));
  const thumbnailFilename = `${thumbBase}_thumb_${Date.now()}.jpg`;
  const thumbnailPath = path.resolve(UPLOAD_DIR_FILMS, thumbnailFilename);

  // Actually extract thumbnail (writes file to disk)
  await extractThumbnail(
    filmPath,
    thumbnailPath,
    timeInSeconds
  );

  // Save thumbnail to disk
  const newThumbnailFilename = thumbnailFilename;

  // Prepare URL (you may have a helper for this, or adjust path)
  const thumbnailUrl = `/uploads/films/${newThumbnailFilename}`;

  // Return both thumbnail URL and filename for saving in the DB, caller will save to record
  return {
    thumbnailUrl,
    thumbnailFilename: newThumbnailFilename,
  };
}


module.exports = {
  getVideoDurationService,
  extractThumbnailService,
  extractThumbnailForFilmsService
};