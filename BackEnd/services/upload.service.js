const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/**
 * Ensures the directory for the order exists, returns its path.
 * @param {string} orderId
 * @returns {string} absolute path to the order's upload dir
 */
function ensureOrderDir(orderId) {
  const orderPath = path.resolve(UPLOAD_DIR, orderId);
  if (!fs.existsSync(orderPath)) {
    fs.mkdirSync(orderPath, { recursive: true });
  }
  return orderPath;
}

/**
 * Save an uploaded file buffer to disk inside the order's directory.
 * @param {string} orderId
 * @param {Buffer} buffer
 * @param {string} originalname
 * @returns {string} relative URL path of stored file
 */
function saveFile(orderId, buffer, originalname) {
  ensureOrderDir(orderId);
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  const filename = uniqueSuffix + ext;
  const filePath = path.join(UPLOAD_DIR, orderId, filename);
  fs.writeFileSync(filePath, buffer);
  // Return URL path for serving
  return `/${UPLOAD_DIR.replace(/^[.\\/]+/, "")}/${orderId}/${filename}`;
}

/**
 * List all uploaded files for an order
 * @param {string} orderId
 * @returns {Array<string>} array of file names
 */
function listOrderFiles(orderId) {
  const dir = path.resolve(UPLOAD_DIR, orderId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Deletes a file from an order's directory
 * @param {string} orderId
 * @param {string} filename
 * @returns {boolean} true if deleted, false if not found
 */
function deleteOrderFile(orderId, filename) {
  const filePath = path.resolve(UPLOAD_DIR, orderId, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = {
  ensureOrderDir,
  saveFile,
  listOrderFiles,
  deleteOrderFile,
};
