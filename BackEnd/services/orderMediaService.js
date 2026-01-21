import Order from '../models/order.js';
import b2 from './b2.service.js';
import Credentials from '../config/Credentials.js';
import fs from 'fs';
import path from 'path';
import allowedExtensions from "../config/allowed_extensions.js";
import { extractThumbnail } from './videoThumbnail.service.js';
import logger from '../utils/logger.js';

export  async function uploadMediaFiles(orderId, files, foldername) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }

  const existingMedia = order.media || [];
  const duplicates = [];
  const filesToUpload = [];

  files.forEach((f) => {
    const isDuplicate = existingMedia.some(
      (existing) =>
        existing.originalName === f.originalname &&
        (existing.foldername || null) === (foldername || null)
    );

    if (isDuplicate) {
      duplicates.push({
        originalName: f.originalname,
        foldername: foldername || null,
      });
      logger.info(
        `Duplicate file detected: "${f.originalname}" in folder "${foldername || 'root'}" for order ${orderId}`
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
        // Construct B2 URL (Assuming S3 compatible URL pattern for Backblaze)
        // Adjust region as needed (e.g. us-west-003)
        const url = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${key}`;
        const filename = key.split('/').pop();

        const fileObj = {
          foldername: foldername || null,
          filename, 
          originalName: f.originalname,
          url, 
          uploadedAt: new Date(),
        };

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
            
            fileObj.thumbnail = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${thumbKey}`;
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

export async function prepareDirectUploads(orderId, files, foldername) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const existingMedia = order.media || [];
  const duplicates = [];
  const uploadSlots = [];

  for (const f of files) {
    const isDuplicate = existingMedia.some(
      (existing) =>
        existing.originalName === f.originalname &&
        (existing.foldername || null) === (foldername || null)
    );

    if (isDuplicate) {
      duplicates.push({ originalName: f.originalname, foldername: foldername || null });
    } else {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const b2FileName = `${uniqueSuffix}-${f.originalname}`;
      const key = `orders/${orderId}/${b2FileName}`;
      
      const uploadData = await b2.getUploadUrl();
      
      uploadSlots.push({
        originalName: f.originalname,
        filename: b2FileName,
        key: key,
        mimetype: f.mimetype,
        uploadUrl: uploadData.uploadUrl,
        authorizationToken: uploadData.authorizationToken
      });
    }
  }

  return { uploadSlots, duplicates };
}

export async function confirmDirectUploads(orderId, uploadedFiles, foldername) {
  const order = await Order.findById(orderId);
  if (!order) throw new Error('Order not found');

  const fileObjs = [];

  for (const f of uploadedFiles) {
    const key = `orders/${orderId}/${f.filename}`;
    const url = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${key}`;

    const fileObj = {
      foldername: foldername || null,
      filename: f.filename,
      originalName: f.originalName,
      url: url,
      uploadedAt: new Date(),
    };

    // Trigger background processing for thumbnails if it's a video
    if (allowedExtensions.videos.includes(f.mimetype)) {
      // Run async without await to return response immediately
      processVideoThumbnailBackground(orderId, f.filename, f.originalName, f.mimetype);
    }

    fileObjs.push(fileObj);
  }

  order.media.push(...fileObjs);
  await order.save();

  return { added: fileObjs };
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
    
    const thumbnailUrl = `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${thumbKey}`;

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
