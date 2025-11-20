const Order = require('../models/order');
const uploadService = require('./upload.service'); // Adjust path as needed
const allowedExtensions = require('../config/allowed_extensions.json');
const { extractOrderVideoThumbnail } = require('./videoThumbnail.service');
const logger = require('../utils/logger');

async function uploadMediaFiles(orderId, files, foldername) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }

  const existingMedia = order.media || [];
  const duplicates = [];
  const filesToUpload = [];

  files.forEach((f) => {
    const isDuplicate = existingMedia.some(
      (existing) =>
        existing.originalName === f.originalname &&
        (existing.foldername || null) === (foldername || null)
    );

    if (isDuplicate) {
      duplicates.push({
        originalName: f.originalname,
        foldername: foldername || null,
      });
      logger.info(
        `Duplicate file detected: "${f.originalname}" in folder "${foldername || 'root'}" for order ${orderId}`
      );
    } else {
      filesToUpload.push(f);
    }
  });

  // Save each file using the uploadService
  const fileObjs = await Promise.all(filesToUpload.map(async (f) => {
    const url = await uploadService.saveFile(orderId, f.buffer, f.originalname, {
      isGallery: false,
      isFilm: false,
    });
    const fileObj = {
      foldername: foldername || null,
      filename: url.split('/').pop(),
      originalName: f.originalname,
      url,
      uploadedAt: new Date(),
    };

    // Video thumbnail extraction
    const isVideo = allowedExtensions.videos.includes(f.mimetype);
    if (isVideo) {
      try {
        const thumbnailResult = await extractOrderVideoThumbnail(orderId, fileObj.filename, 1);
        fileObj.thumbnail = thumbnailResult.thumbnailUrl;
        fileObj.thumbnailFilename = thumbnailResult.thumbnailFilename;
      } catch (err) {
        logger.error(`Failed to extract thumbnail for ${fileObj.filename}: ${err.message}`);
      }
    }

    return fileObj;
  }));

  order.media.push(...fileObjs);
  await order.save();

  return {
    added: fileObjs,
    duplicates,
    message: `${fileObjs.length} file(s) uploaded, ${duplicates.length} duplicate(s) skipped.`
  };
}

module.exports = {
  uploadMediaFiles,
  // Add more media-related methods here as needed (e.g., delete media, etc.)
};