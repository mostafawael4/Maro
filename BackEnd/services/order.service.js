import path from "path";
import logger from "../utils/logger.js";
import Order from '../models/order.js';
import uploadService from "./upload.service.js"; // Import upload service

const UPLOAD_DIR_ORDERS = process.env.UPLOAD_DIR_ORDERS || "./uploads/orders";

/**
 * Gets all media file paths (images and videos) from the order's 'media' array.
 * @param {string} orderId
 * @returns {Promise<string[]>} Array of file paths
 */
const getOrderFilesPaths = async (orderId) => {
  if (!orderId) throw new Error("Order ID is required");
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error("Order not found");
  if (!order.media || !Array.isArray(order.media)) return [];
  // Assume each media object at least has a 'url' or 'path'
  const paths = order.media
    .map((m) => m.filename)
    .filter(Boolean);
  return paths;
};

/**
 * Attempts to delete order folder (all files for an order).
 * Returns an object with arrays of successfully deleted files and failed deletions.
 * @param {string} orderId
 * @returns 
 */
const deleteOrderfolder = async (orderId) => {
  try {
    // List all files for the order from B2 (or rely on what we have, but listing ensures we get everything under the prefix)
    const files = await uploadService.listOrderFiles(orderId);

    if (!files || files.length === 0) {
      logger.info(`No files found for order folder: ${orderId}`);
      return;
    }

    const failed = [];
    for (const filename of files) {
      try {
        await uploadService.deleteFile(orderId, filename);
      } catch (err) {
        failed.push({ filename, error: err.message });
      }
    }

    if (failed.length > 0) {
      logger.warn(`Failed to delete some files in order folder ${orderId}: ${JSON.stringify(failed)}`);
      return { filesDeletedSuccessfully: [], filesFailedToDeleted: failed };
    }

    logger.info(`Successfully deleted all files for order: ${orderId}`);
    return;
  } catch (err) {
    logger.error(`Failed to delete order folder: ${orderId} - ${err.message}`);
    return { filesDeletedSuccessfully: [], filesFailedToDeleted: [{ filePath: orderId, error: err.message }] };
  }
};

/**
 * Deletes a single file for a specific order by filename.
 * @param {string} orderId
 * @param {string} filename
 * @returns {Promise<void>}
 */
const deleteOrderFileByFileName = async (orderId, filename) => {
  if (!orderId) throw new Error("Order ID is required");
  if (!filename) throw new Error("Filename is required");

  try {
    // Find the order to get media details
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    const mediaItem = order.media.find(m => m.filename === filename);

    // If media item has a thumbnail, delete it first
    if (mediaItem && mediaItem.thumbnailFilename) {
      try {
        await uploadService.deleteFile(orderId, mediaItem.thumbnailFilename);
        logger.info(`Deleted associated thumbnail: ${mediaItem.thumbnailFilename} (orderId: ${orderId})`);
      } catch (thumbErr) {
        logger.error(`Failed to delete associated thumbnail ${mediaItem.thumbnailFilename}: ${thumbErr.message}`);
        // We continue even if thumbnail delete fails, to ensure main file is attempted
      }
    }

    // Delete main file from B2
    await uploadService.deleteFile(orderId, filename);
    logger.info(`Deleted file: ${filename} (orderId: ${orderId})`);

    // Check if this file is the current background and clear it if so
    if (order.orderBackground && order.orderBackground.filename === filename) {
      order.orderBackground.image = null;
      order.orderBackground.filename = null;
      await order.save();
      logger.info(`Cleared orderBackground for order ${orderId} because background file ${filename} was deleted.`);
    }

    // Then remove the file from the order's media array in the database
    const updateResult = await Order.updateOne(
      { _id: orderId },
      { $pull: { media: { filename } } }
    );
    if (updateResult.modifiedCount === 0) {
      logger.warn(`File deleted from server but not found in media array (orderId: ${orderId}, filename: ${filename})`);
    } else {
      logger.info(`Removed file '${filename}' from order (${orderId}) media array`);
    }
  } catch (error) {
    logger.error(`Failed to delete file or update media array: ${filename} (orderId: ${orderId}) - ${error.message}`);
    throw new Error(`Failed to delete file ${filename} for order ${orderId}: ${error.message}`);
  }
};


export {
  getOrderFilesPaths,
  deleteOrderfolder,
  deleteOrderFileByFileName
};
