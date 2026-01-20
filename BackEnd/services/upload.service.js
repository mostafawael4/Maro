import b2Service from "./b2.service.js";
import logger from "../utils/logger.js";
import Credentials from "../config/Credentials.js";
import fs from "fs";
import path from "path";

/**
 * Save an uploaded file buffer to B2
 * @param {string|undefined} orderId If present, saves to orders directory, otherwise to gallery/films/homepage
 * @param {Buffer|string} buffer File contents or path to temporary file
 * @param {string} originalname Original file name
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean } (optional)
 * @returns {Promise<string>} B2 URL of stored file
 */
const saveFile = async (orderId, buffer, originalname, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;

  let keyPrefix = '';
  // Prefixes for filenames to avoid collisions/identify types easily
  let filenamePrefix = ''; 

  if (isGallery) {
    keyPrefix = 'gallery';
    filenamePrefix = 'gallery-';
  } else if (isFilm) {
    keyPrefix = 'films';
    filenamePrefix = 'film-';
  } else if (isHomePage) {
    keyPrefix = 'homepage';
    filenamePrefix = 'homepage-';
  } else {
    if (!orderId) {
      logger.error("orderId required if not saving as gallery, film, or homepage file");
      throw new Error("orderId required if not saving as gallery file");
    }
    keyPrefix = `orders/${orderId}`;
    filenamePrefix = 'order-';
  }

  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  const filename = `${filenamePrefix}${uniqueSuffix}${ext}`;
  const key = `${keyPrefix}/${filename}`;

  let dataToUpload = buffer;
  // If buffer is a file path, read it
  if (typeof buffer === 'string') {
    if (fs.existsSync(buffer)) {
      dataToUpload = fs.readFileSync(buffer);
      // Cleanup temp file
      try {
        fs.unlinkSync(buffer);
      } catch (e) {
        logger.warn(`Failed to delete temp file: ${buffer}`);
      }
    } else {
        throw new Error(`File path does not exist: ${buffer}`);
    }
  }

  try {
    await b2Service.upload(key, dataToUpload);
    logger.info(`Saved file to B2: ${key}`);
    
    // Construct URL - Assuming typical S3-compatible URL for B2
    const url = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${key}`;
    return url;
  } catch (err) {
    logger.error(`Failed to save file to B2: ${originalname}, error: ${err instanceof Error ? err.stack : err}`);
    throw err;
  }
}

/**
 * List all uploaded files for an order or for the gallery
 * Note: This now lists from B2 which might be slower. 
 * @param {string|undefined} orderId 
 * @param {Object} options 
 * @returns {Promise<Array<string>>} array of file names (keys or basenames?)
 */
const listOrderFiles = async (orderId, options = {}) => {
  const isGallery = options.isGallery || false;
  let prefix;
  if (isGallery) {
    prefix = 'gallery/';
  } else {
    if (!orderId) throw new Error("orderId required if not listing gallery files");
    prefix = `orders/${orderId}/`;
  }

  try {
    const files = await b2Service.listFileNames(prefix);
    // Return just filenames (basename) to maintain some compatibility or full keys?
    // Original listOrderFiles returned fs.readdirSync (basenames).
    return files.map(f => f.fileName.split('/').pop());
  } catch (err) {
    logger.error(`Failed to list files: ${err.message}`);
    return [];
  }
}

/**
 * Deletes a file from B2
 * @param {string|undefined} orderId 
 * @param {string} filename 
 * @param {Object} options 
 * @returns {Promise<boolean>}
 */
const deleteFile = async (orderId, filename, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;

  let key = '';

  if (isGallery) {
    key = `gallery/${filename}`;
  } else if (isFilm) {
    key = `films/${filename}`;
  } else if (isHomePage) {
    key = `homepage/${filename}`;
  } else {
    if (!orderId) throw new Error("orderId required to delete non-global files");
    key = `orders/${orderId}/${filename}`;
  }

  try {
    const deleted = await b2Service.deleteFile(key);
    if (deleted) {
        logger.info(`Deleted file from B2: ${key}`);
    } else {
        logger.warn(`File not found in B2 to delete: ${key}`);
    }
    return deleted;
  } catch (err) {
    logger.error(`Failed to delete file from B2: ${key}, error: ${err.message}`);
    throw err;
  }
}

// Aliases for compatibility/clarity
const deleteOrderFile = deleteFile;

export default {
  saveFile,
  listOrderFiles,
  deleteFile,
  deleteOrderFile
};
