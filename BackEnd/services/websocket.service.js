import logger from '../utils/logger.js';

let wssInstance = null;

/**
 * Set the WebSocket server instance
 * @param {WebSocketServer} wss - WebSocket server instance
 */
export function setWebSocketServer(wss) {
  wssInstance = wss;
  logger.info('WebSocket service initialized');
}

/**
 * Get the WebSocket server instance
 * @returns {WebSocketServer|null}
 */
export function getWebSocketServer() {
  return wssInstance;
}

/**
 * Broadcast message to a specific client
 * @param {string} clientId - Client identifier (adminId)
 * @param {Object} message - Message object with type and payload
 */
export function sendToClient(clientId, message) {
  if (!wssInstance || !wssInstance.trackedClients) {
    logger.warn('WebSocket server not initialized');
    return false;
  }

  let sent = false;

  wssInstance.trackedClients.forEach((clientData, ws) => {
    if (clientData.clientId === clientId && ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify(message));
      sent = true;
    }
  });

  if (!sent) {
    logger.warn(`Client ${clientId} not connected via WebSocket`);
  }

  return sent;
}

/**
 * Broadcast message to all connected clients
 * @param {Object} message - Message object with type and payload
 */
export function broadcastToAll(message) {
  if (!wssInstance || !wssInstance.clients) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  let count = 0;
  wssInstance.clients.forEach((ws) => {
    if (ws.readyState === 1) { // 1 = OPEN
      ws.send(JSON.stringify(message));
      count++;
    }
  });

  logger.info(`Broadcast message to ${count} clients`);
}

/**
 * Notify client about upload completion
 * @param {string} clientId - Client identifier
 * @param {Object} uploadData - Upload metadata
 */
export function notifyUploadComplete(clientId, uploadData) {
  const message = {
    type: 'uploadComplete',
    payload: {
      context: uploadData.context,
      uploadId: uploadData.uploadId,
      filesCount: uploadData.filesCount,
      totalSize: uploadData.totalSize,
      duration: uploadData.duration,
      timestamp: new Date().toISOString(),
      message: `Successfully uploaded ${uploadData.filesCount} file(s)`
    }
  };

  sendToClient(clientId, message);
  logger.info(`Upload complete notification sent to ${clientId}: ${uploadData.context}`);
}

/**
 * Notify client about upload failure
 * @param {string} clientId - Client identifier
 * @param {Object} errorData - Error information
 */
export function notifyUploadFailure(clientId, errorData) {
  const message = {
    type: 'uploadFailure',
    payload: {
      context: errorData.context,
      uploadId: errorData.uploadId,
      error: errorData.error,
      filesAffected: errorData.filesAffected,
      timestamp: new Date().toISOString()
    }
  };

  sendToClient(clientId, message);
  logger.error(`Upload failure notification sent to ${clientId}: ${errorData.error}`);
}

/**
 * Notify client about processing status
 * @param {string} clientId - Client identifier
 * @param {Object} processingData - Processing status data
 */
export function notifyProcessingStatus(clientId, processingData) {
  const message = {
    type: 'processingStatus',
    payload: {
      context: processingData.context,
      filename: processingData.filename,
      status: processingData.status, // 'started', 'progress', 'completed', 'failed'
      progress: processingData.progress, // 0-100
      message: processingData.message,
      timestamp: new Date().toISOString()
    }
  };

  sendToClient(clientId, message);
  logger.info(`Processing status sent to ${clientId}: ${processingData.status} - ${processingData.message}`);
}

/**
 * Process uploaded file (implements context-specific processing)
 * @param {string} context - Upload context (order, gallery, film, homepage)
 * @param {Object} fileData - File data object with filename, originalName, mimetype
 * @param {string} clientId - Client identifier for notifications
 * @param {string} orderId - Order ID (only for order context)
 */
export async function processUploadedFile(context, fileData, clientId, orderId = null) {
  logger.info(`Processing file: ${fileData.filename} in context: ${context}`);

  try {
    // Notify processing started
    if (clientId) {
      notifyProcessingStatus(clientId, {
        context,
        filename: fileData.filename,
        status: 'started',
        progress: 0,
        message: 'Starting file processing...'
      });
    }

    let result = null;

    switch (context) {
      case 'gallery':
        result = await processGalleryFile(fileData, clientId);
        break;

      case 'film':
        result = await processFilmFile(fileData, clientId);
        break;

      case 'homepage':
        result = await processHomepageFile(fileData, clientId);
        break;

      case 'order':
        if (!orderId) {
          logger.warn('Order ID required for order context processing');
          throw new Error('Order ID required for order context processing');
        }
        result = await processOrderFile(fileData, clientId, orderId);
        break;

      default:
        logger.warn(`Unknown context for processing: ${context}`);
        throw new Error(`Unknown context: ${context}`);
    }

    // Notify processing completed
    if (clientId) {
      notifyProcessingStatus(clientId, {
        context,
        filename: fileData.filename,
        status: 'completed',
        progress: 100,
        message: 'Processing completed successfully'
      });
    }

    return result;

  } catch (error) {
    logger.error(`Error processing file ${fileData.filename}: ${error.message}`);

    if (clientId) {
      notifyProcessingStatus(clientId, {
        context,
        filename: fileData.filename,
        status: 'failed',
        progress: 0,
        message: `Processing failed: ${error.message}`
      });
    }

    throw error;
  }
}

/**
 * Process gallery file - adapted from gallery confirm-direct-upload
 */
async function processGalleryFile(fileData, clientId) {
  const { default: Gallery } = await import('../models/Gallery.js');
  const { default: b2 } = await import('./b2.service.js');
  const { default: uploadService } = await import('./upload.service.js');

  const context = { type: 'gallery' };
  const { exists, url } = await uploadService.verifyFileExists(context, fileData.filename);

  if (!exists) {
    throw new Error(`Gallery file verification failed: ${fileData.filename}`);
  }

  const newImage = await Gallery.create({
    filename: fileData.filename,
    url: url,
    uploadedAt: new Date(),
  });

  logger.info(`Gallery image record created: ${newImage.filename}`);
  return newImage;
}

/**
 * Process film file - adapted from films confirm-direct-upload
 */
async function processFilmFile(fileData, clientId) {
  const { default: Film } = await import('../models/Film.js');
  const { default: b2 } = await import('./b2.service.js');
  const { default: uploadService } = await import('./upload.service.js');
  const { extractThumbnailForFilmsService } = await import('./videoService.js');

  const context = { type: 'film' };
  const { exists, url } = await uploadService.verifyFileExists(context, fileData.filename);

  if (!exists) {
    throw new Error(`Film file verification failed: ${fileData.filename}`);
  }

  const newFilm = await Film.create({
    filename: fileData.filename,
    url: url,
    description: fileData.description || '',
    uploadedAt: new Date()
  });

  logger.info(`Film record created: ${newFilm.filename}`);

  // Auto-generate thumbnail for video files
  if (fileData.mimetype && fileData.mimetype.startsWith('video/')) {
    try {
      if (clientId) {
        notifyProcessingStatus(clientId, {
          context: 'film',
          filename: fileData.filename,
          status: 'progress',
          progress: 50,
          message: 'Generating thumbnail...'
        });
      }

      const thumbnailResult = await extractThumbnailForFilmsService(
        newFilm._id.toString(),
        newFilm.filename,
        1 // Extract at 1 second
      );

      newFilm.thumbnail = thumbnailResult.thumbnailUrl;
      newFilm.thumbnailFilename = thumbnailResult.thumbnailFilename;
      await newFilm.save();

      logger.info(`Thumbnail generated for film: ${newFilm.filename}`);
    } catch (thumbErr) {
      logger.error(`Failed to generate thumbnail for film ${newFilm.filename}: ${thumbErr.message}`);
      // Don't fail the whole process if thumbnail fails
    }
  }

  return newFilm;
}

/**
 * Process homepage file - adapted from homepage confirm-direct-upload
 */
async function processHomepageFile(fileData, clientId) {
  const { default: HomePage } = await import('../models/HomePage.js');
  const { default: uploadService } = await import('./upload.service.js');

  const context = { type: 'homepage' };
  const { exists, url } = await uploadService.verifyFileExists(context, fileData.filename);

  if (!exists) {
    throw new Error(`HomePage file verification failed: ${fileData.filename}`);
  }

  const newImage = await HomePage.create({
    filename: fileData.filename,
    url: url,
    uploadedAt: new Date(),
  });

  logger.info(`HomePage image record created: ${newImage.filename}`);
  return newImage;
}

/**
 * Process order file - adapted from orders confirm-direct-upload
 */
async function processOrderFile(fileData, clientId, orderId) {
  const { default: Order } = await import('../models/order.js');
  const { default: b2 } = await import('./b2.service.js');
  const allowedExtensions = (await import('../config/allowed_extensions.js')).default;

  const key = `orders/${orderId}/${fileData.filename}`;

  // Verify file existence in B2
  const foundFiles = await b2.listFileNames(key, 1);
  const exists = foundFiles && foundFiles.some(file => file.fileName === key);

  if (!exists) {
    throw new Error(`File verification failed: ${key} not found`);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }

  const url = b2.getFileUrl(key);

  const fileObj = {
    foldername: fileData.foldername || null,
    filename: fileData.filename,
    originalName: fileData.originalName,
    url: url,
    uploadedAt: new Date(),
  };

  // Trigger background processing for thumbnails if it's a video
  if (allowedExtensions.videos.includes(fileData.mimetype)) {
    try {
      if (clientId) {
        notifyProcessingStatus(clientId, {
          context: 'order',
          filename: fileData.filename,
          status: 'progress',
          progress: 50,
          message: 'Generating thumbnail for video...'
        });
      }

      // Background thumbnail processing
      processVideoThumbnailForOrder(orderId, fileData.filename, fileData.originalName, fileData.mimetype, clientId);
    } catch (thumbErr) {
      logger.error(`Failed to start thumbnail processing for ${fileData.filename}: ${thumbErr.message}`);
    }
  }

  // order.media.push(fileObj);
  // await order.save();
  // logger.info(`Order media added: ${fileData.filename} to order ${orderId}`);

  // We rely on confirmDirectUploads to add the file to the DB to prevent duplicates
  // This function only triggers background processing if needed (e.g. video thumbs)
  logger.info(`WebSocket processed file: ${fileData.filename} (DB insertion skipped - handled by HTTP)`);

  return fileObj;
}

/**
 * Background video thumbnail processing for orders
 */
async function processVideoThumbnailForOrder(orderId, filename, originalName, mimetype, clientId) {
  try {
    const { default: Order } = await import('../models/order.js');
    const { default: b2 } = await import('./b2.service.js');
    const { extractThumbnail } = await import('./videoThumbnail.service.js');
    const fs = await import('fs');
    const path = await import('path');

    const key = `orders/${orderId}/${filename}`;

    // Download small portion of video to extract thumbnail
    const videoBuffer = await b2.downloadFileRange(key, 0, 5 * 1024 * 1024);
    const tempVideoPath = path.resolve('tmp', `thumb-gen-${filename}`);
    fs.writeFileSync(tempVideoPath, Buffer.from(videoBuffer));

    const thumbName = `thumb-${Date.now()}-${originalName}.jpg`;
    const thumbPath = path.resolve('tmp', thumbName);

    await extractThumbnail(tempVideoPath, thumbPath, 1);

    const thumbBuffer = fs.readFileSync(thumbPath);
    const thumbKey = `orders/${orderId}/${thumbName}`;
    await b2.upload(thumbKey, thumbBuffer);

    const thumbnailUrl = b2.getFileUrl(thumbKey);

    // Update DB
    await Order.updateOne(
      { _id: orderId, "media.filename": filename },
      {
        $set: {
          "media.$.thumbnail": thumbnailUrl,
          "media.$.thumbnailFilename": thumbName
        }
      }
    );

    // Cleanup
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    logger.info(`Background thumbnail generated for ${filename}`);

    if (clientId) {
      notifyProcessingStatus(clientId, {
        context: 'order',
        filename: filename,
        status: 'completed',
        progress: 100,
        message: 'Thumbnail generated successfully'
      });
    }
  } catch (err) {
    logger.error(`Background thumbnail generation failed for ${filename}: ${err.message}`);

    if (clientId) {
      notifyProcessingStatus(clientId, {
        context: 'order',
        filename: filename,
        status: 'failed',
        progress: 0,
        message: `Thumbnail generation failed: ${err.message}`
      });
    }
  }
}

export default {
  setWebSocketServer,
  getWebSocketServer,
  sendToClient,
  broadcastToAll,
  notifyUploadComplete,
  notifyUploadFailure,
  notifyProcessingStatus,
  processUploadedFile
};
