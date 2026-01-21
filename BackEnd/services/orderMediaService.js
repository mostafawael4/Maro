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
