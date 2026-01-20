const fs = require("fs");
const path = require("path");
const os = require("os");
const Credential = require("../config/Credentials");
const logger = require("../utils/logger");

// Import B2 service - check if available
let b2Service = null;
try {
  b2Service = require('./b2.service');
} catch (err) {
  logger.warn('B2 service not available');
}

const UPLOAD_DIR_ORDERS = Credential.UPLOAD_DIR_ORDERS;
const UPLOAD_DIR_GALLERY = Credential.UPLOAD_DIR_GALLERY;
const UPLOAD_DIR_FILMS = Credential.UPLOAD_DIR_FILMS;
const UPLOAD_DIR_HOMEPAGE = Credential.UPLOAD_DIR_HOMEPAGE;

// Detect Firebase environment
const IS_FIREBASE = process.env.FUNCTION_TARGET || process.env.K_SERVICE;

/**
 * Ensures a given upload directory exists and returns its path.
 * Supported types: 'orders', 'gallery', 'films', 'homepage'
 * If 'orders', must provide orderId as second argument.
 * On Firebase, uses /tmp directory (temporary storage)
 *
 * @param {'orders'|'gallery'|'films'|'homepage'} type
 * @param {string} [orderId] - Required if type is 'orders'
 * @returns {string} absolute path to the upload directory
 */
const ensureUploadDir = (type, orderId) => {
  // On Firebase, use /tmp for temporary file operations
  // Files should be uploaded to B2, not stored locally
  const baseDir = IS_FIREBASE 
    ? path.join(os.tmpdir(), 'maro-uploads')
    : (type === 'orders' ? UPLOAD_DIR_ORDERS :
       type === 'gallery' ? UPLOAD_DIR_GALLERY :
       type === 'films' ? UPLOAD_DIR_FILMS :
       UPLOAD_DIR_HOMEPAGE);

  let dirPath;
  switch (type) {
    case 'orders':
      if (!orderId) {
        logger.error("orderId is required for 'orders' type");
        throw new Error("orderId is required for 'orders' type");
      }
      dirPath = path.resolve(baseDir, 'orders', orderId);
      logger.info(`Ensuring upload directory for order: ${dirPath}`);
      break;
    case 'gallery':
      dirPath = path.resolve(baseDir, 'gallery');
      logger.info(`Ensuring gallery upload directory: ${dirPath}`);
      break;
    case 'films':
      dirPath = path.resolve(baseDir, 'films');
      logger.info(`Ensuring films upload directory: ${dirPath}`);
      break;
    case 'homepage':
      dirPath = path.resolve(baseDir, 'homepage');
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
 * Generate B2 public URL from file path
 * @param {string} filePath - B2 file path (e.g., "orders/123/file.jpg")
 * @returns {string} Full B2 public URL
 */
function getB2PublicUrl(filePath) {
  // Construct B2 public URL
  // Format: https://f{bucketId}.s3.{region}.backblazeb2.com/{filePath}
  // Or use custom domain if configured in B2
  const bucketId = Credential.B2_BUCKET_ID;
  
  if (!bucketId) {
    throw new Error('B2_BUCKET_ID not configured');
  }

  // Default B2 S3-compatible endpoint format
  // Adjust region if your bucket is in a different region
  const b2Url = `https://f${bucketId}.s3.us-west-000.backblazeb2.com/${filePath}`;
  
  // If you have a custom domain configured in B2, use it instead:
  // const b2Url = `https://your-custom-domain.com/${filePath}`;
  
  return b2Url;
}

/**
 * Save an uploaded file buffer to disk or B2 storage
 * On Firebase: Always uploads to B2 and returns full B2 URL
 * On local dev: Saves to local filesystem and returns relative path
 * 
 * @param {string|undefined} orderId If present, saves to orders directory, otherwise to gallery
 * @param {Buffer} buffer File contents
 * @param {string} originalname Original file name
 * @param {Object} options Options object, { isGallery: boolean, isFilm: boolean, isHomePage: boolean } (optional)
 * @returns {Promise<string>} Full B2 URL (on Firebase) or relative URL path (on local dev)
 */
const saveFile = async (orderId, buffer, originalname, options = {}) => {
  const isGallery = options.isGallery || false;
  const isFilm = options.isFilm || false;
  const isHomePage = options.isHomePage || false;
  
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  const filename = uniqueSuffix + ext;
  let prefixedFilename;
  let filePath; // B2 file path (without leading slash)

  try {
    // Determine file path structure for B2
    if (isGallery) {
      prefixedFilename = `gallery-${filename}`;
      filePath = `gallery/${prefixedFilename}`;
    } else if (isFilm) {
      prefixedFilename = `film-${filename}`;
      filePath = `films/${prefixedFilename}`;
    } else if (isHomePage) {
      prefixedFilename = `homepage-${filename}`;
      filePath = `homepage/${prefixedFilename}`;
    } else {
      if (!orderId) {
        logger.error("orderId required if not saving as gallery, film, or homepage file");
        throw new Error("orderId required if not saving as gallery file");
      }
      prefixedFilename = `order-${filename}`;
      filePath = `orders/${orderId}/${prefixedFilename}`;
    }

    // On Firebase, always use B2 for storage
    if (IS_FIREBASE) {
      if (!b2Service || !Credential.B2_APPLICATION_KEY_ID) {
        throw new Error('B2 service required on Firebase Functions. Please configure B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, and B2_BUCKET_ID environment variables.');
      }

      try {
        logger.info(`Uploading to B2: ${filePath}`);
        
        // Upload to B2
        await b2Service.upload(filePath, buffer);
        
        // Generate and return full B2 public URL
        const b2Url = getB2PublicUrl(filePath);
        
        logger.info(`File uploaded to B2: ${b2Url}`);
        return b2Url;
      } catch (b2Err) {
        logger.error(`B2 upload failed: ${b2Err.message}`);
        throw new Error(`File storage failed: ${b2Err.message}`);
      }
    }

    // Local development - use local filesystem storage
    let dirPath = '';
    if (isGallery) {
      dirPath = ensureUploadDir('gallery');
    } else if (isFilm) {
      dirPath = ensureUploadDir('films');
    } else if (isHomePage) {
      dirPath = ensureUploadDir('homepage');
    } else {
      dirPath = ensureUploadDir('orders', orderId);
    }

    const destPath = path.join(dirPath, prefixedFilename);
    fs.writeFileSync(destPath, buffer);
    
    // Generate relative URL path for local development
    let urlPath = '';
    if (isGallery) {
      urlPath = `/${UPLOAD_DIR_GALLERY.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
    } else if (isFilm) {
      urlPath = `/${UPLOAD_DIR_FILMS.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
    } else if (isHomePage) {
      urlPath = `/${UPLOAD_DIR_HOMEPAGE.replace(/^[.\\/]+/, "")}/${prefixedFilename}`;
    } else {
      urlPath = `/${UPLOAD_DIR_ORDERS.replace(/^[.\\/]+/, "")}/${orderId}/${prefixedFilename}`;
    }
    
    logger.info(`File saved locally: ${destPath}`);
    return urlPath;
  } catch (err) {
    logger.error(`Failed to save file: ${originalname}, error: ${err instanceof Error ? err.stack : err}`);
    throw err;
  }
};

/**
 * List all uploaded files for an order or for the gallery
 * Note: On Firebase, this won't work since files are in B2, not local filesystem
 * @param {string|undefined} orderId If present, lists order files; otherwise gallery files
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {Array<string>} array of file names
 */
const listOrderFiles = (orderId, options = {}) => {
  // On Firebase, files are in B2 - this function won't work
  // Consider implementing B2 list files if needed
  if (IS_FIREBASE) {
    logger.warn('listOrderFiles() not supported on Firebase - files are stored in B2');
    return [];
  }

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
};

/**
 * Deletes a file from an order's directory or from the gallery
 * Note: On Firebase, files are in B2 - deletion would need B2 API call
 * @param {string|undefined} orderId If present, deletes from order upload dir, else from gallery
 * @param {string} filename Filename to delete
 * @param {Object} options Options object, { isGallery: boolean } (optional)
 * @returns {boolean} true if deleted, false if not found
 */
const deleteOrderFile = (orderId, filename, options = {}) => {
  // On Firebase, files are in B2 - this function won't work
  // Consider implementing B2 file deletion if needed
  if (IS_FIREBASE) {
    logger.warn('deleteOrderFile() not fully supported on Firebase - files are stored in B2');
    return false;
  }

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
};

module.exports = {
  ensureUploadDir,
  saveFile,
  listOrderFiles,
  deleteOrderFile,
};