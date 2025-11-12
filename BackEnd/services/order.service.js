const path = require("path");
const logger = require("../utils/logger");
const Order = require('../models/order');
const { deleteFileByPath, deleteFolderByPath } = require("../utils/fileProccess");
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
 * Attempts to delete order folder.
 * Returns an object with arrays of successfully deleted files and failed deletions.
 * @param {string} orderId
 * @returns 
 */
const deleteOrderfolder = async (orderId) => {
  const folderPath = path.resolve(UPLOAD_DIR_ORDERS, orderId);
  try {
    await deleteFolderByPath(folderPath);
    logger.info(`Successfully deleted order folder: ${folderPath}`);
    return ;
  } catch (err) {
    logger.error(`Failed to delete order folder: ${folderPath} - ${err.message}`);
    return { filesDeletedSuccessfully: [], filesFailedToDeleted: [{ filePath: folderPath, error: err.message }] };
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
  const deletingPath = path.resolve(UPLOAD_DIR_ORDERS, orderId, filename);
  try {
    // Delete file from the server first
    await deleteFileByPath(deletingPath);
    logger.info(`Deleted file: ${deletingPath} (orderId: ${orderId}, filename: ${filename})`);

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
    logger.error(`Failed to delete file or update media array: ${deletingPath} (orderId: ${orderId}, filename: ${filename}) - ${error.message}`);
    throw new Error(`Failed to delete file ${filename} for order ${orderId}: ${error.message}`);
  }
};


module.exports = {
  getOrderFilesPaths,
  deleteOrderfolder,
  deleteOrderFileByFileName
};
