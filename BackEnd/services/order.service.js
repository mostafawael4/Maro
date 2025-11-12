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
 * Attempts to delete all files in the given filepaths array.
 * Returns an object with arrays of successfully deleted files and failed deletions.
 * @param {string[]} filepaths
 * @returns {Promise<{ filesDeletedSuccessfully: string[], filesFailedToDeleted: { filePath: string, error: string }[] }>}
 */
const deleteOrderfolder = async (orderId) => {
  const folderPath = path.resolve(UPLOAD_DIR_ORDERS, orderId);
  try {
    await deleteFolderByPath(folderPath);
    logger.info(`Successfully deleted order folder: ${folderPath}`);
    return { filesDeletedSuccessfully: [folderPath], filesFailedToDeleted: [] };
  } catch (err) {
    logger.error(`Failed to delete order folder: ${folderPath} - ${err.message}`);
    return { filesDeletedSuccessfully: [], filesFailedToDeleted: [{ filePath: folderPath, error: err.message }] };
  }
};

module.exports = {
  getOrderFilesPaths,
  deleteOrderfolder
};
