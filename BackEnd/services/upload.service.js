const fs = require("fs");
const path = require("path");
const Credential = require("../config/Credentials");
const logger = require("../utils/logger");
const UPLOAD_DIR_ORDERS = Credential.UPLOAD_DIR_ORDERS;
const UPLOAD_DIR_GALLERY = Credential.UPLOAD_DIR_GALLERY;
const UPLOAD_DIR_FILMS = Credential.UPLOAD_DIR_FILMS;
const UPLOAD_DIR_HOMEPAGE = Credential.UPLOAD_DIR_HOMEPAGE;

/**
 * Ensures a given upload directory exists and returns its path.
 * Supported types: 'orders', 'gallery', 'films', 'homepage'
 * If 'orders', must provide orderId as second argument.
 *
 * @param {'orders'|'gallery'|'films'|'homepage'} type
 * @param {string} [orderId] - Required if type is 'orders'
 * @returns {string} absolute path to the upload directory
 */
const ensureUploadDir = (type, orderId) => {
  let baseDir;
  let dirPath;
  switch (type) {
    case 'orders':
      if (!orderId) {
        logger.error("orderId is required for 'orders' type");
        throw new Error("orderId is required for 'orders' type");
      }
      baseDir = UPLOAD_DIR_ORDERS;
      dirPath = path.resolve(baseDir, orderId);
      logger.info(`Ensuring upload directory for order: ${dirPath}`);
      break;
    case 'gallery':
      baseDir = UPLOAD_DIR_GALLERY;
      dirPath = path.resolve(baseDir);
      logger.info(`Ensuring gallery upload directory: ${dirPath}`);
      break;
    case 'films':
      baseDir = UPLOAD_DIR_FILMS;
      dirPath = path.resolve(baseDir);
      logger.info(`Ensuring films upload directory: ${dirPath}`);
      break;
    case 'homepage':
      baseDir = UPLOAD_DIR_HOMEPAGE;
      dirPath = path.resolve(baseDir);
      logger.info(`Ensuring homepage upload directory: ${dirPath}`);
      break;
    default:
      logger.error("Unknown upload type: " + type);
      throw new Error("Unknown upload type: " + type);
  }
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created upload directory at: ${dirPath}`);
  } else {
    logger.info(`Upload directory already exists: ${dirPath}`);
  }
  return dirPath;
}

/**
 * Save an uploaded file buffer to disk inside the correct directory (order or gallery)
 * @param {string|undefined} orderId If present, saves to orders directory, otherwise to gallery
 * @param {Buffer} buffer File contents
 * @param {string} originalname Original file name
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean } (optional)
 * @returns {string} relative URL path of stored file
 */
const saveFile = (orderId, buffer, originalname, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;
  let dirPath = '';
  let urlPath = '';
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  let filename = uniqueSuffix + ext;
  let prefixedFilename;

  try {
    if (isGallery) {
      dirPath = ensureUploadDir('gallery');;
      prefixedFilename = `gallery-${filename}`;
      urlPath = `/${UPLOAD_DIR_GALLERY.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
      logger.info(`Saving file to gallery: ${prefixedFilename}`);
    } else if (isFilm) {
      dirPath = ensureUploadDir('films');
      prefixedFilename = `film-${filename}`;
      urlPath = `/${UPLOAD_DIR_FILMS.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
      logger.info(`Saving file to films: ${prefixedFilename}`);
    } else if (isHomePage) {
      dirPath = ensureUploadDir("homepage");
      prefixedFilename = `homepage-${filename}`;
      urlPath = `/${UPLOAD_DIR_HOMEPAGE.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
      logger.info(`Saving file to homepage: ${prefixedFilename}`);
    } else {
      if (!orderId) {
        logger.error("orderId required if not saving as gallery, film, or homepage file");
        throw new Error("orderId required if not saving as gallery file");
      }
      dirPath = ensureUploadDir('orders', orderId);
      prefixedFilename = `order-${filename}`;
      urlPath = `/${UPLOAD_DIR_ORDERS.replace(/^[.\\/]+/, "")}/${orderId}/${prefixedFilename}`;
      logger.info(`Saving file to order (${orderId}): ${prefixedFilename}`);
    }
    filename = prefixedFilename;
    const destPath = path.join(dirPath, filename);
    fs.writeFileSync(destPath, buffer);
    logger.info(`File successfully written: ${destPath}`);
    return urlPath;
  } catch (err) {
    logger.error(`Failed to save file: ${originalname}, error: ${err instanceof Error ? err.stack : err}`);
    throw err;
  }
}

/**
 * List all uploaded files for an order or for the gallery
 * @param {string|undefined} orderId If present, lists order files; otherwise gallery files
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {Array<string>} array of file names
 */
const listOrderFiles = (orderId, options = {}) => {
  const isGallery = options.isGallery || false;
  let dir;
  if (isGallery) {
    dir = path.resolve(UPLOAD_DIR_GALLERY);
    logger.info(`Listing files in gallery directory: ${dir}`);
  } else {
    if (!orderId) {
      logger.error("orderId required if not listing gallery files");
      throw new Error("orderId required if not listing gallery files");
    }
    dir = path.resolve(UPLOAD_DIR_ORDERS, orderId);
    logger.info(`Listing files in order directory (${orderId}): ${dir}`);
  }
  if (!fs.existsSync(dir)) {
    logger.warn(`Directory does not exist: ${dir}`);
    return [];
  }
  const files = fs.readdirSync(dir);
  logger.info(`Found ${files.length} file(s) in directory: ${dir}`);
  return files;
}

/**
 * Deletes a file from an order's directory or from the gallery
 * @param {string|undefined} orderId If present, deletes from order upload dir, else from gallery
 * @param {string} filename Filename to delete
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {boolean} true if deleted, false if not found
 */
const deleteOrderFile = (orderId, filename, options = {}) => {
  const isGallery = options.isGallery || false;
  let filePath;
  if (isGallery) {
    filePath = path.resolve(UPLOAD_DIR_GALLERY, filename);
    logger.info(`Deleting gallery file: ${filePath}`);
  } else {
    if (!orderId) {
      logger.error("orderId is required to delete non-gallery files");
      throw new Error("orderId is required to delete non-gallery files");
    }
    filePath = path.resolve(UPLOAD_DIR_ORDERS, orderId, filename);
    logger.info(`Deleting order file: ${filePath}`);
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info(`Deleted file: ${filePath}`);
    return true;
  } else {
    logger.warn(`File does not exist, cannot delete: ${filePath}`);
  }
  return false;
}

module.exports = {
  ensureUploadDir,
  saveFile,
  listOrderFiles,
  deleteOrderFile,
};
