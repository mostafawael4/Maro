const fs = require("fs");
const path = require("path");

const UPLOAD_DIR_ORDERS = process.env.UPLOAD_DIR_ORDERS || "./uploads/orders";
const UPLOAD_DIR_GALLERY = process.env.UPLOAD_DIR_GALLERY || "./uploads/gallery";
const UPLOAD_DIR_FILMS = process.env.UPLOAD_DIR_FILMS || "./uploads/films";

/**
 * Ensures the directory for the order exists, returns its path.
 * @param {string} orderId
 * @returns {string} absolute path to the order's upload dir
 */
function ensureOrderDir(orderId) {
  const orderPath = path.resolve(UPLOAD_DIR_ORDERS, orderId);
  if (!fs.existsSync(orderPath)) {
    fs.mkdirSync(orderPath, { recursive: true });
  }
  return orderPath;
}

/**
 * Ensures the directory for the gallery exists, returns its path.
 * @returns {string} absolute path to the gallery's upload dir
 */
function ensureGalleryDir() {
  const galleryPath = path.resolve(UPLOAD_DIR_GALLERY);
  if (!fs.existsSync(galleryPath)) {
    fs.mkdirSync(galleryPath, { recursive: true });
  }
  return galleryPath;
}

/**
 * Ensures the directory for the films exists, returns its path.
 * @returns {string} absolute path to the films's upload dir
 */
function ensureFilmsDir() {
  const filmsPath = path.resolve(UPLOAD_DIR_FILMS);
  if (!fs.existsSync(filmsPath)) {
    fs.mkdirSync(filmsPath, { recursive: true });
  }
  return filmsPath;
}

/**
 * Save an uploaded file buffer to disk inside the correct directory (order or gallery)
 * @param {string|undefined} orderId If present, saves to orders directory, otherwise to gallery
 * @param {Buffer} buffer File contents
 * @param {string} originalname Original file name
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {string} relative URL path of stored file
 */
function saveFile(orderId, buffer, originalname, options = {}) {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  let dirPath='';
  let urlPath='';
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  let filename = uniqueSuffix + ext;

  let prefixedFilename;
  if (isGallery) {
    dirPath = ensureGalleryDir();
    prefixedFilename = `gallery-${filename}`;
    urlPath = `/${UPLOAD_DIR_GALLERY.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
  } else if (isFilm) {
    dirPath = ensureFilmsDir();
    prefixedFilename = `film-${filename}`;
    urlPath = `/${UPLOAD_DIR_FILMS.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
  } else {
    if (!orderId) throw new Error("orderId required if not saving as gallery file");
    dirPath = ensureOrderDir(orderId);
    prefixedFilename = `order-${filename}`;
    urlPath = `/${UPLOAD_DIR_ORDERS.replace(/^[.\\/]+/, "")}/${orderId}/${prefixedFilename}`;
  }
  filename = prefixedFilename;
  fs.writeFileSync(path.join(dirPath, filename), buffer);
  return urlPath;
}

/**
 * List all uploaded files for an order or for the gallery
 * @param {string|undefined} orderId If present, lists order files; otherwise gallery files
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {Array<string>} array of file names
 */
function listOrderFiles(orderId, options = {}) {
  const isGallery = options.isGallery || false;
  let dir;
  if (isGallery) {
    dir = path.resolve(UPLOAD_DIR_GALLERY);
  } else {
    if (!orderId) throw new Error("orderId required if not listing gallery files");
    dir = path.resolve(UPLOAD_DIR_ORDERS, orderId);
  }
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Deletes a file from an order's directory or from the gallery
 * @param {string|undefined} orderId If present, deletes from order upload dir, else from gallery
 * @param {string} filename Filename to delete
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {boolean} true if deleted, false if not found
 */
function deleteOrderFile(orderId, filename) {
  const filePath = path.resolve(UPLOAD_DIR_ORDERS, orderId, filename);
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
