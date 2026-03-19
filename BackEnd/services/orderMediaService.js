import Order from '../models/order.js';
import b2 from './b2.service.js';
import Credentials from '../config/Credentials.js';
import fs from 'fs';
import path from 'path';
import allowedExtensions from "../config/allowed_extensions.js";
import { extractThumbnail } from './videoThumbnail.service.js';
import logger from '../utils/logger.js';
import websocketService from './websocket.service.js';

// Helper function to process image thumbnails
async function processImageThumbnail(orderId, filename, originalName, buffer, mimetype) {
  try {
    const { default: sharp } = await import('sharp');
    const path = await import('path');
    const fs = await import('fs');

    const tmpDir = path.resolve('tmp');
    if (!fs.existsSync(tmpDir)) {
      logger.info(`Creating missing tmp directory at ${tmpDir}`);
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    let imageBuffer = buffer;

    // If no buffer provided (direct upload scenario), download from B2
    if (!imageBuffer) {
      const key = `orders/${orderId}/${filename}`;
      logger.info(`Downloading image for thumbnail generation: ${key}`);
      // Download max 10MB just to be safe for thumbnail generation
      imageBuffer = await b2.downloadFileRange(key, 0, 10 * 1024 * 1024);
    }

    if (!imageBuffer) {
      throw new Error("Could not retrieve image buffer for thumbnail generation");
    }

    // Ensure imageBuffer is a Node.js Buffer (B2 returns ArrayBuffer)
    const finalBuffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);

    const thumbName = `thumb-${Date.now()}-${originalName}`;
    const thumbPath = path.resolve(tmpDir, thumbName);

    // Resize to 400x400 max
    await sharp(finalBuffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .toFormat('jpeg', { quality: 80 })
      .toFile(thumbPath);

    const thumbBuffer = fs.readFileSync(thumbPath);
    const thumbKey = `orders/${orderId}/${thumbName}`;

    await b2.upload(thumbKey, thumbBuffer);
    const thumbnailUrl = b2.getFileUrl(thumbKey);

    // Cleanup
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    return { thumbnail: thumbnailUrl, thumbnailFilename: thumbName };

  } catch (err) {
    logger.error(`Thumbnail generation failed for ${filename} (Order: ${orderId}): ${err.message}`, { stack: err.stack });
    return null; // Graceful failure
  }
}


export async function uploadMediaFiles(orderId, files, foldername) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }

  const normalizedFoldername = foldername ? foldername.trim() : null;

  const existingMedia = order.media || [];
  const duplicates = [];
  const filesToUpload = [];

  files.forEach((f) => {
    const isDuplicate = existingMedia.some(
      (existing) =>
        existing.originalName === f.originalname &&
        (existing.foldername || null) === normalizedFoldername
    );

    if (isDuplicate) {
      duplicates.push({
        originalName: f.originalname,
        foldername: normalizedFoldername,
      });
      logger.info(
        `Duplicate file detected: "${f.originalname}" in folder "${normalizedFoldername || 'root'}" for order ${orderId}`
      );
    } else {
      filesToUpload.push(f);
    }
  });

  // Concurrency Limit
  const CONCURRENCY_LIMIT = 5;
  const chunks = [];
  for (let i = 0; i < filesToUpload.length; i += CONCURRENCY_LIMIT) {
    chunks.push(filesToUpload.slice(i, i + CONCURRENCY_LIMIT));
  }

  const fileObjs = [];
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(async (f) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const key = `orders/${orderId}/${uniqueSuffix}-${f.originalname}`;

      // Read file from disk (multer diskStorage)
      let buffer;
      if (f.buffer) {
        buffer = f.buffer;
      } else if (f.path) {
        buffer = fs.readFileSync(f.path);
      } else {
        throw new Error("No file content found (buffer or path)");
      }

      // Upload to B2
      await b2.upload(key, buffer);

      // Construct Native B2 URL
      const url = b2.getFileUrl(key);
      const filename = key.split('/').pop();

      const fileObj = {
        foldername: normalizedFoldername,
        filename,
        originalName: f.originalname,
        url,
        size: f.size || 0,
        uploadedAt: new Date(),
      };

      // IMAGE THUMBNAIL
      if (allowedExtensions.images.includes(f.mimetype)) {
        const thumbResult = await processImageThumbnail(orderId, filename, f.originalname, buffer, f.mimetype);
        if (thumbResult) {
          fileObj.thumbnail = thumbResult.thumbnail;
          fileObj.thumbnailFilename = thumbResult.thumbnailFilename;
        }
      }

      // Video thumbnail extraction
      if (allowedExtensions.videos.includes(f.mimetype)) {
        try {
          let videoPath = f.path;
          let tempVideoPath = null;

          // If we don't have a path (memory storage), write to temp file for ffmpeg
          if (!videoPath) {
            tempVideoPath = path.resolve('tmp', filename);
            fs.writeFileSync(tempVideoPath, buffer);
            videoPath = tempVideoPath;
          }

          const thumbName = `thumb-${Date.now()}-${f.originalname}.jpg`;
          const thumbPath = path.resolve('tmp', thumbName);

          // Extract thumbnail using the generic service
          await extractThumbnail(videoPath, thumbPath, 1);

          // Upload thumbnail
          const thumbBuffer = fs.readFileSync(thumbPath);
          const thumbKey = `orders/${orderId}/${thumbName}`;
          await b2.upload(thumbKey, thumbBuffer);

          fileObj.thumbnail = b2.getFileUrl(thumbKey);
          fileObj.thumbnailFilename = thumbName;

          // Cleanup thumbnail
          if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
          if (tempVideoPath && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

        } catch (err) {
          logger.error(`Failed to extract thumbnail for ${fileObj.filename}: ${err.message}`);
        }
      }

      // Cleanup uploaded file if it was on disk
      if (f.path && fs.existsSync(f.path)) {
        fs.unlinkSync(f.path);
      }

      return fileObj;
    }));
    fileObjs.push(...chunkResults);
  }

  order.media.push(...fileObjs);
  await order.save();

  return {
    added: fileObjs,
    duplicates,
    message: `${fileObjs.length} file(s) uploaded, ${duplicates.length} duplicate(s) skipped.`
  };
}


// Helper to sanitize filenames
function sanitizeFilename(filename) {
  return filename
    .replace(/\s+/g, '_')          // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9._-]/g, '') // Remove any non-alphanumeric chars except . _ -
    .replace(/^_+|_+$/g, '');      // Trim underscores
}

export async function prepareDirectUploads(orderId, files, foldername) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const existingMedia = order.media || [];
  const duplicates = [];
  const uploadSlots = [];
  const rejectedFiles = [];

  const normalizedFoldername = foldername ? foldername.trim() : null;

  const allowedMimes = [...allowedExtensions.images, ...allowedExtensions.videos];
  const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

  for (const f of files) {
    if (!allowedMimes.includes(f.mimetype)) {
      logger.warn(`Blocked upload of unsupported type: ${f.mimetype}`);
      rejectedFiles.push({ 
        originalName: f.originalname, 
        reason: 'Unsupported file type',
        size: f.size 
      });
      continue;
    }
    if (f.size && f.size > MAX_SIZE) {
      const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
      const maxSizeMB = (MAX_SIZE / (1024 * 1024)).toFixed(0);
      logger.warn(`Blocked upload of oversized file: ${f.originalname} (${f.size} bytes)`);
      rejectedFiles.push({ 
        originalName: f.originalname, 
        reason: `File size (${sizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
        size: f.size 
      });
      continue;
    }

    const isDuplicate = existingMedia.some(
      (existing) =>
        existing.originalName === f.originalname &&
        (existing.foldername || null) === normalizedFoldername
    );

    if (isDuplicate) {
      duplicates.push({ originalName: f.originalname, foldername: normalizedFoldername });
    } else {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      // SANITIZE THE FILENAME
      const cleanOriginalName = sanitizeFilename(f.originalname);
      const b2FileName = `${uniqueSuffix}-${cleanOriginalName}`;
      const key = `orders/${orderId}/${b2FileName}`;

      // Use Native B2 Upload URL
      const { uploadUrl, authorizationToken } = await b2.getUploadUrl();

      uploadSlots.push({
        originalName: f.originalname,
        filename: b2FileName,
        key: key,
        mimetype: f.mimetype,
        uploadUrl: uploadUrl,
        authorizationToken: authorizationToken
      });
    }
  }

  // If all files were rejected, throw an error
  if (uploadSlots.length === 0 && duplicates.length === 0 && rejectedFiles.length > 0) {
    const reasons = rejectedFiles.map(f => `${f.originalName}: ${f.reason}`).join('; ');
    throw new Error(`All files were rejected: ${reasons}`);
  }

  return { uploadSlots, duplicates, rejectedFiles };
}

export async function confirmDirectUploads(orderId, uploadedFiles, foldername) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const normalizedFoldername = foldername ? foldername.trim() : null;
  const fileObjs = [];

  for (const f of uploadedFiles) {
    const key = `orders/${orderId}/${f.filename}`;

    // Verify file existence in B2 using listFileNames (b2.service removed headObject)
    // We search for the specific file name in the folder (prefix)
    // Actually the prefix is the full key for exact match attempt
    const foundFiles = await b2.listFileNames(key, 1);

    // B2 listFileNames returns files starting with prefix.
    // We should check if one matches exactly.
    const exists = foundFiles && foundFiles.some(file => file.fileName === key);

    if (!exists) {
      logger.warn(`File verification failed: ${key} not found.`);
      continue;
    }

    const url = b2.getFileUrl(key);

    const fileObj = {
      foldername: normalizedFoldername,
      filename: f.filename,
      originalName: f.originalName,
      url: url,
      size: f.size || 0,
      uploadedAt: new Date(),
    };

    // Check if file already exists in order.media to prevent DB duplicates
    const alreadyExists = order.media.some(m =>
      m.filename === f.filename ||
      (m.originalName === f.originalName && (m.foldername || null) === normalizedFoldername)
    );

    if (alreadyExists) {
      logger.warn(`Skipping duplicate file in confirm: ${f.filename}`);
      continue;
    }

    fileObjs.push(fileObj);

    // Trigger background processing
    if (allowedExtensions.videos.includes(f.mimetype)) {
      processVideoThumbnailBackground(orderId, f.filename, f.originalName, f.mimetype);
    }

    // NEW: Trigger background image optimization
    if (allowedExtensions.images.includes(f.mimetype)) {
      // Fire and forget - don't await to avoid blocking response
      processOrderImageOptimization(orderId, f.filename, f.originalName).catch(err => {
        logger.error(`Background image optimization failed for ${f.filename}: ${err.message}`);
      });
    }
  }

  order.media.push(...fileObjs);
  await order.save();

  return { verified: fileObjs };
}

/**
 * Background task to optimize order images using the central service
 */
async function processOrderImageOptimization(orderId, filename, originalName) {
  try {
    const { default: imageProcessingService } = await import('./imageProcessing.service.js');
    const key = `orders/${orderId}/${filename}`;

    logger.info(`Starting background image optimization for order ${orderId} file ${filename}`);

    const processedImages = await imageProcessingService.processImage(key);

    if (processedImages) {
      await Order.updateOne(
        { _id: orderId, "media.filename": filename },
        {
          $set: {
            "media.$.thumbnail": processedImages.thumbnail || null,
            "media.$.medium": processedImages.medium || null,
            "media.$.hero": processedImages.hero || null
          }
        }
      );
      logger.info(`Order image optimized successfully: ${filename}`);
    }
  } catch (err) {
    logger.error(`Failed to optimize order image ${filename}: ${err.message}`);
  }
}

async function processImageThumbnailBackground(orderId, filename, originalName, mimetype) {
  try {
    const result = await processImageThumbnail(orderId, filename, originalName, null, mimetype);
    if (result) {
      // Update DB
      await Order.updateOne(
        { _id: orderId, "media.filename": filename },
        {
          $set: {
            "media.$.thumbnail": result.thumbnail,
            "media.$.thumbnailFilename": result.thumbnailFilename
          }
        }
      );
      logger.info(`Background image thumbnail generated for ${filename}`);
    }
  } catch (err) {
    logger.error(`Background image thumbnail generation failed for ${filename}: ${err.message}`);
  }
}

async function processVideoThumbnailBackground(orderId, filename, originalName, mimetype) {
  try {
    const key = `orders/${orderId}/${filename}`;
    // Download small portion of video (first 5MB) to extract thumbnail
    const videoBuffer = await b2.downloadFileRange(key, 0, 5 * 1024 * 1024);
    const tempVideoPath = path.resolve('tmp', `thumb-gen-${filename}`);
    fs.writeFileSync(tempVideoPath, Buffer.from(videoBuffer));

    const thumbName = `thumb-${Date.now()}-${originalName}.jpg`;
    const thumbPath = path.resolve('tmp', thumbName);

    await extractThumbnail(tempVideoPath, thumbPath, 1);

    const thumbBuffer = fs.readFileSync(thumbPath);
    const thumbKey = `orders/${orderId}/${thumbName}`;
    await b2.upload(thumbKey, thumbBuffer);

    const thumbnailUrl = b2.getFileUrl(thumbKey);

    // Update DB
    await Order.updateOne(
      { _id: orderId, "media.filename": filename },
      {
        $set: {
          "media.$.thumbnail": thumbnailUrl,
          "media.$.thumbnailFilename": thumbName
        }
      }
    );

    // Cleanup
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    logger.info(`Background thumbnail generated for ${filename}`);
  } catch (err) {
    logger.error(`Background thumbnail generation failed for ${filename}: ${err.message}`);
  }
}

export async function generateThumbnailsForOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const media = order.media || [];
  const imagesWithoutThumbnails = media.filter(m => {
    // Check if it's an image and has no thumbnail
    const ext = m.filename.split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(ext);
    return isImage && !m.thumbnail;
  });

  logger.info(`Found ${imagesWithoutThumbnails.length} images without thumbnails for order ${orderId}`);

  let processedCount = 0;
  let errorCount = 0;

  // Process in batches
  const CONCURRENCY = 3;
  for (let i = 0; i < imagesWithoutThumbnails.length; i += CONCURRENCY) {
    const batch = imagesWithoutThumbnails.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (mediaItem) => {
      try {
        // Determine mime type from extension simply
        const ext = mediaItem.filename.split('.').pop().toLowerCase();
        let mime = 'image/jpeg';
        if (ext === 'png') mime = 'image/png';
        if (ext === 'webp') mime = 'image/webp';

        const result = await processImageThumbnail(orderId, mediaItem.filename, mediaItem.originalName || mediaItem.filename, null, mime);

        if (result) {
          await Order.updateOne(
            { _id: orderId, "media.filename": mediaItem.filename },
            {
              $set: {
                "media.$.thumbnail": result.thumbnail,
                "media.$.thumbnailFilename": result.thumbnailFilename
              }
            }
          );
          processedCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        logger.error(`Error regenerating thumbnail for ${mediaItem.filename}: ${err.message}`);
        errorCount++;
      }
    }));
  }

  return { processed: processedCount, errors: errorCount, total: imagesWithoutThumbnails.length };
}
