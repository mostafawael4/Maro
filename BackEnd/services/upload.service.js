// ... imports
import b2Service from "./b2.service.js";
import logger from "../utils/logger.js";
import Credentials from "../config/Credentials.js";
import fs from "fs";
import path from "path";

// Helper to determine key and filename logic
const getContextPaths = (context, originalName) => {
    const { type, orderId } = context;
    let keyPrefix = '';
    let filenamePrefix = '';

    if (type === 'gallery') {
       keyPrefix = 'gallery';
       filenamePrefix = 'gallery-';
    } else if (type === 'film') {
       keyPrefix = 'films';
       filenamePrefix = 'film-';
    } else if (type === 'homepage') {
       keyPrefix = 'homepage';
       filenamePrefix = 'homepage-';
    } else if (type === 'order') {
       if (!orderId) throw new Error("orderId required for order upload context");
       keyPrefix = `orders/${orderId}`;
       filenamePrefix = 'order-'; // actually order logic uses just random suffix usually, keeping consistent with simple logic here
    } else {
       throw new Error(`Unknown upload context type: ${type}`);
    }

    // If for order, we might use a lighter prefix or none as per existing logic,
    // but having a prefix helps collision avoidance.
    // Existing logic in orderMediaService uses: Date + Random + OriginalName
    
    // We will stick to a standard pattern:
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Sanitize original name
    const sanitizedOriginal = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // For Orders, existing was: `orders/${orderId}/${uniqueSuffix}-${f.originalname}`
    // For others in saveFile: `${keyPrefix}/${filenamePrefix}${uniqueSuffix}${ext}`
    
    let filename;
    if (type === 'order') {
        filename = `${uniqueSuffix}-${sanitizedOriginal}`;
    } else {
        filename = `${filenamePrefix}${uniqueSuffix}-${sanitizedOriginal}`;
    }
    
    const key = `${keyPrefix}/${filename}`;
    
    return { key, filename, keyPrefix };
};


/**
 * Prepare a direct upload
 * @param {Object} context { type: 'gallery'|'film'|'homepage'|'order', orderId? }
 * @param {Object} fileInfo { originalName, mimeType, size }
 * @returns {Promise<Object>} { uploadUrl, authorizationToken, key, filename }
 */
const prepareDirectUpload = async (context, fileInfo) => {
    const { originalName } = fileInfo;
    const { key, filename } = getContextPaths(context, originalName);

    // Get Native B2 Upload URL/Token
    const { uploadUrl, authorizationToken } = await b2Service.getUploadUrl();

    return {
        uploadUrl,
        authorizationToken,
        key,
        filename
    };
};

/**
 * Verify a direct upload exists in B2
 * @param {Object} context { type: 'gallery'|'film'|'homepage'|'order', orderId? }
 * @param {string} filename The filename returned from prepareDirectUpload
 * @returns {Promise<Object>} { exists: boolean, url: string, key: string }
 */
const verifyFileExists = async (context, filename) => {
    const { type, orderId } = context;
    let keyPrefix = '';
    
    if (type === 'gallery') keyPrefix = 'gallery';
    else if (type === 'film') keyPrefix = 'films';
    else if (type === 'homepage') keyPrefix = 'homepage';
    else if (type === 'order') keyPrefix = `orders/${orderId}`;
    
    const key = `${keyPrefix}/${filename}`;

    // Use listFileNames to verify existence
    const foundFiles = await b2Service.listFileNames(key, 1);
    const exists = foundFiles && foundFiles.some(file => file.fileName === key);

    return {
        exists,
        url: exists ? b2Service.getFileUrl(key) : null,
        key
    };
};


/**
 * Save an uploaded file buffer to B2 (Legacy/Server-side upload)
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

  let contextType = 'order';
  if (isGallery) contextType = 'gallery';
  else if (isFilm) contextType = 'film';
  else if (isHomePage) contextType = 'homepage';

  const { key } = getContextPaths({ type: contextType, orderId }, originalname);

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
    
    return b2Service.getFileUrl(key);
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
  deleteOrderFile,
  prepareDirectUpload,
  verifyFileExists
};

