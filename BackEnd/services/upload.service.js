const fs = require("fs");
const path = require("path");
const Credential = require("../config/Credentials");
const logger = require("../utils/logger");
const UPLOAD_DIR_ORDERS = Credential.UPLOAD_DIR_ORDERS;
const UPLOAD_DIR_GALLERY = Credential.UPLOAD_DIR_GALLERY;
const UPLOAD_DIR_FILMS = Credential.UPLOAD_DIR_FILMS;
const UPLOAD_DIR_HOMEPAGE = Credential.UPLOAD_DIR_HOMEPAGE;
const ftpService = require("./ftp.service");

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
    case "orders":
      if (!orderId) {
        logger.error("orderId is required for 'orders' type");
        throw new Error("orderId is required for 'orders' type");
      }
      baseDir = UPLOAD_DIR_ORDERS;
      dirPath = path.resolve(baseDir, orderId);
      logger.info(`Ensuring upload directory for order: ${dirPath}`);
      break;
    case "gallery":
      baseDir = UPLOAD_DIR_GALLERY;
      dirPath = path.resolve(baseDir);
      logger.info(`Ensuring gallery upload directory: ${dirPath}`);
      break;
    case "films":
      baseDir = UPLOAD_DIR_FILMS;
      dirPath = path.resolve(baseDir);
      logger.info(`Ensuring films upload directory: ${dirPath}`);
      break;
    case "homepage":
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
};

/**
 * Save an uploaded file buffer to disk inside the correct directory (order or gallery)
 * @param {string|undefined} orderId If present, saves to orders directory, otherwise to gallery
 * @param {Buffer} buffer File contents
 * @param {string} originalname Original file name
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean, uploadId: string } (optional)
 * @returns {string} relative URL path of stored file
 */
const saveFile = async (orderId, buffer, originalname, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;

  let remotePath = "";
  let urlPath = "";
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  let filename = uniqueSuffix + ext;
  let prefixedFilename;

  try {
    // Build remote path based on file type
    if (isGallery) {
      prefixedFilename = `gallery-${filename}`;
      remotePath = `/uploads/${UPLOAD_DIR_GALLERY.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      urlPath = `/${UPLOAD_DIR_GALLERY.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      logger.info(`Uploading file to gallery via FTP: ${prefixedFilename}`);
    } else if (isFilm) {
      prefixedFilename = `film-${filename}`;
      remotePath = `/uploads/${UPLOAD_DIR_FILMS.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      urlPath = `/${UPLOAD_DIR_FILMS.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      logger.info(`Uploading file to films via FTP: ${prefixedFilename}`);
    } else if (isHomePage) {
      prefixedFilename = `homepage-${filename}`;
      remotePath = `/uploads/${UPLOAD_DIR_HOMEPAGE.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      urlPath = `/${UPLOAD_DIR_HOMEPAGE.replace(
        /^[.\\/]+/,
        ""
      )}/${prefixedFilename}`;
      logger.info(`Uploading file to homepage via FTP: ${prefixedFilename}`);
    } else {
      if (!orderId) {
        logger.error(
          "orderId required if not saving as gallery, film, or homepage file"
        );
        throw new Error("orderId required if not saving as gallery file");
      }
      prefixedFilename = `order-${filename}`;
      remotePath = `/${UPLOAD_DIR_ORDERS.replace(
        /^[.\\/]+/,
        ""
      )}/${orderId}/${prefixedFilename}`;
      urlPath = `/${UPLOAD_DIR_ORDERS.replace(
        /^[.\\/]+/,
        ""
      )}/${orderId}/${prefixedFilename}`;
    }
    logger.info(`Uploading file to order (${orderId}) via FTP: ${remotePath}`);

    // Pass uploadId from options to ftpService
    const uploadedUrl = await ftpService.uploadFile(
      buffer,
      remotePath,
      options.uploadId
    );

    // If FTP service returns full URL, use it; otherwise use the relative path
    const finalUrl = uploadedUrl || urlPath;

    logger.info(`File successfully uploaded to FTP server: ${finalUrl}`);
    return finalUrl;
  } catch (err) {
    logger.error(
      `Failed to upload file to FTP: ${originalname}, error: ${
        err instanceof Error ? err.stack : err
      }`
    );
    throw err;
  }
};

/**
 * List all uploaded files for an order or for the gallery (from FTP server)
 * @param {string|undefined} orderId If present, lists order files; otherwise gallery files
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean } (optional)
 * @returns {Promise<Array<string>>} array of file names
 */
const listOrderFiles = async (orderId, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;
  let remoteDir = "";

  try {
    if (isGallery) {
      remoteDir = `/uploads/${UPLOAD_DIR_GALLERY.replace(/^[.\\/]+/, "")}`;
    } else if (isFilm) {
      remoteDir = `/uploads/${UPLOAD_DIR_FILMS.replace(/^[.\\/]+/, "")}`;
    } else if (isHomePage) {
      remoteDir = `/uploads/${UPLOAD_DIR_HOMEPAGE.replace(/^[.\\/]+/, "")}`;
    } else {
      if (!orderId) {
        logger.error(
          "orderId required if not listing gallery/film/homepage files"
        );
        throw new Error(
          "orderId required if not listing gallery/film/homepage files"
        );
      }
      remoteDir = `/uploads/${UPLOAD_DIR_ORDERS.replace(
        /^[.\\/]+/,
        ""
      )}/${orderId}`;
    }

    const files = await ftpService.listFiles(remoteDir);
    logger.info(`Found ${files.length} file(s) in FTP directory: ${remoteDir}`);
    return files;
  } catch (err) {
    logger.error(`Failed to list files from FTP: ${err.message}`);
    return [];
  }
};

/**
 * Deletes a file from FTP server (order or gallery)
 * @param {string|undefined} orderId If present, deletes from order upload dir, else from gallery
 * @param {string} filename Filename to delete
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean } (optional)
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
const deleteOrderFile = async (orderId, filename, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;
  let remotePath = "";

  try {
    // Build remote path based on file type
    if (isGallery) {
      remotePath = `/uploads/${UPLOAD_DIR_GALLERY.replace(
        /^[.\\/]+/,
        ""
      )}/${filename}`;
      logger.info(`Deleting gallery file from FTP: ${filename}`);
    } else if (isFilm) {
      remotePath = `/uploads/${UPLOAD_DIR_FILMS.replace(
        /^[.\\/]+/,
        ""
      )}/${filename}`;
      logger.info(`Deleting film file from FTP: ${filename}`);
    } else if (isHomePage) {
      remotePath = `/uploads/${UPLOAD_DIR_HOMEPAGE.replace(
        /^[.\\/]+/,
        ""
      )}/${filename}`;
      logger.info(`Deleting homepage file from FTP: ${filename}`);
    } else {
      if (!orderId) {
        logger.error(
          "orderId is required to delete non-gallery/film/homepage files"
        );
        throw new Error(
          "orderId is required to delete non-gallery/film/homepage files"
        );
      }
      remotePath = `/uploads/${UPLOAD_DIR_ORDERS.replace(
        /^[.\\/]+/,
        ""
      )}/${orderId}/${filename}`;
      logger.info(`Deleting order file from FTP: ${filename}`);
    }

    // Delete from FTP server
    await ftpService.deleteFile(remotePath);
    logger.info(`File successfully deleted from FTP server: ${remotePath}`);
    return true;
  } catch (err) {
    logger.error(
      `Failed to delete file from FTP: ${filename}, error: ${err.message}`
    );
    // Return false if file not found, throw for other errors
    if (
      err.message.includes("not found") ||
      err.message.includes("No such file")
    ) {
      return false;
    }
    throw err;
  }
};

module.exports = {
  ensureUploadDir,
  saveFile,
  listOrderFiles,
  deleteOrderFile,
};
