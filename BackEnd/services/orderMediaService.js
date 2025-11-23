const Order = require("../models/order");
const uploadService = require("./upload.service"); // Adjust path as needed
const allowedExtensions = require("../config/allowed_extensions.json");
const { extractOrderVideoThumbnail } = require("./videoThumbnail.service");
const logger = require("../utils/logger");

/**
 * Process files with concurrency limit (to respect FTP server connection limits)
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item (receives item and index)
 * @param {number} limit - Maximum concurrent operations (default: 2)
 * @returns {Promise<Array>} Results array in original order
 */
async function processWithConcurrencyLimit(items, processor, limit = 2) {
  const results = new Array(items.length);

  // Process in batches to limit concurrency
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchPromises = batch.map((item, batchIndex) => {
      const originalIndex = i + batchIndex;
      return processor(item, originalIndex);
    });

    const batchResults = await Promise.all(batchPromises);

    // Store results at correct indices
    batch.forEach((item, batchIndex) => {
      const originalIndex = i + batchIndex;
      results[originalIndex] = batchResults[batchIndex];
    });
  }

  return results;
}

async function uploadMediaFiles(orderId, files, foldername, uploadIds) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
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
        `Duplicate file detected: "${f.originalname}" in folder "${
          foldername || "root"
        }" for order ${orderId}`
      );
    } else {
      filesToUpload.push(f);
    }
  });

  if (filesToUpload.length === 0) {
    logger.info(`No files to upload for order ${orderId} - all are duplicates`);
    return {
      added: [],
      duplicates,
      message: `0 file(s) uploaded, ${duplicates.length} duplicate(s) skipped.`,
    };
  }

  logger.info(
    `Uploading ${filesToUpload.length} file(s) to order ${orderId} with concurrency limit of 2`
  );

  // Process files with concurrency limit (max 2 at a time to stay under 3-connection limit)
  const fileObjs = await processWithConcurrencyLimit(
    filesToUpload,
    async (f, index) => {
      // Generate uploadId for progress tracking
      const uploadId =
        uploadIds && uploadIds[index]
          ? uploadIds[index]
          : `upload_${orderId}_${Date.now()}_${index}`;

      logger.info(
        `Processing file [${index + 1}/${filesToUpload.length}]: ${
          f.originalname
        } (Upload ID: ${uploadId})`
      );

      try {
        const url = await uploadService.saveFile(
          orderId,
          f.buffer,
          f.originalname,
          {
            isGallery: false,
            isFilm: false,
            uploadId: uploadId,
          }
        );

        const fileObj = {
          foldername: foldername || null,
          filename: url.split("/").pop(),
          originalName: f.originalname,
          url,
          uploadedAt: new Date(),
        };

        // Video thumbnail extraction
        const isVideo = allowedExtensions.videos.includes(f.mimetype);
        if (isVideo) {
          try {
            const thumbnailResult = await extractOrderVideoThumbnail(
              orderId,
              fileObj.filename,
              1
            );
            fileObj.thumbnail = thumbnailResult.thumbnailUrl;
            fileObj.thumbnailFilename = thumbnailResult.thumbnailFilename;
          } catch (err) {
            logger.error(
              `Failed to extract thumbnail for ${fileObj.filename}: ${err.message}`
            );
          }
        }

        logger.info(
          `Successfully uploaded file [${index + 1}/${filesToUpload.length}]: ${
            f.originalname
          }`
        );

        return fileObj;
      } catch (err) {
        logger.error(
          `Failed to upload file [${index + 1}/${filesToUpload.length}]: ${
            f.originalname
          } - ${err.message}`
        );
        throw err; // Re-throw to fail the batch
      }
    },
    2 // Max 2 concurrent uploads (stays under 3-connection limit)
  );

  order.media.push(...fileObjs);
  await order.save();

  logger.info(
    `Successfully uploaded ${fileObjs.length} file(s) to order ${orderId}`
  );

  return {
    added: fileObjs,
    duplicates,
    message: `${fileObjs.length} file(s) uploaded, ${duplicates.length} duplicate(s) skipped.`,
  };
}

module.exports = {
  uploadMediaFiles,
  // Add more media-related methods here as needed (e.g., delete media, etc.)
};
