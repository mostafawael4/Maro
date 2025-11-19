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

module.exports = {
  getVideoDurationService,
  extractThumbnailService,
};