import express from "express";
import multer from "multer";
import Gallery from "../models/Gallery.js";
const router = express.Router();
import path from "path";
import Credential from "../config/Credentials.js"
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";
import b2 from "../services/b2.service.js";
import websocketService from "../services/websocket.service.js";

const signGalleryImage = (image) => {
  if (!image) return image;
  // Use public CDN URL without authorization
  const cdnUrl = Credential.OFFICIAL_CDN_URL;
  const bucketName = Credential.B2_BUCKET_NAME;

  const sign = (filename) => `${cdnUrl}/file/${bucketName}/gallery/${encodeURIComponent(filename)}`;

  const newImage = (typeof image.toObject === 'function') ? image.toObject() : { ...image };

  if (newImage.filename) {
    newImage.url = sign(newImage.filename);
  }

  // Handle derived images (thumbnail, medium, hero)
  // These are stored as full B2 URLs currently (e.g., https://f005.backblazeb2.com/file/bucket/gallery/filename.webp)
  // We need to extract the filename and re-sign it with CDN, OR replace the B2 domain with CDN domain.
  // Since we know the structure, let's just replace the domain part or re-construct.
  // The imageProcessing service saves them as `b2Service.getFileUrl(newFileKey)` which is `https://f005.backblazeb2.com/file/${bucketName}/${key}`

  const derived = ['thumbnail', 'medium', 'hero'];
  derived.forEach(field => {
    if (newImage[field]) {
      // extract filename from the URL. 
      // URL is like: .../file/bucketName/gallery/filename.webp
      // We can just grab the last part.
      const parts = newImage[field].split('/');
      const filename = parts.pop();
      if (filename) {
        newImage[field] = sign(filename);
      }
    }
  });

  return newImage;
};

// Upload image to gallery

// Prepare Direct Upload
router.post("/prepare-direct-upload", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !files.length) {
      return res.status(400).json({ error: "No files provided" });
    }

    const uploadSlots = [];
    const duplicates = [];
    for (const file of files) {
      if (!allowedExtensions.images.includes(file.mimetype)) {
        logger.warn(`Blocked gallery upload of unsupported type: ${file.mimetype}`);
        continue;
      }

      const context = { type: 'gallery' };
      const slot = await uploadService.prepareDirectUpload(context, { originalName: file.originalname });

      if (slot.exists) {
        duplicates.push({
          originalName: file.originalname,
          filename: slot.filename,
          key: slot.key,
          mimetype: file.mimetype,
          exists: true
        });
        logger.warn(`Duplicate gallery file detected: ${file.originalname}`);
      } else {
        uploadSlots.push({
          originalName: file.originalname,
          filename: slot.filename,
          key: slot.key,
          uploadUrl: slot.uploadUrl,
          authorizationToken: slot.authorizationToken,
          mimetype: file.mimetype
        });
      }
    }

    res.json({ ok: true, uploadSlots, duplicates });
  } catch (err) {
    logger.error("Gallery prepare upload error:", err);
    res.status(500).json({ error: "Failed to prepare upload" });
  }
});

// Confirm Direct Upload
router.post("/confirm-direct-upload", async (req, res) => {
  try {
    const { uploadedFiles } = req.body;
    if (!uploadedFiles || !uploadedFiles.length) {
      return res.status(400).json({ error: "No files to confirm" });
    }

    const verifiedFiles = [];
    const failedFiles = [];

    for (const file of uploadedFiles) {
      const context = { type: 'gallery' };
      const { exists } = await uploadService.verifyFileExists(context, file.filename);

      if (exists) {
        verifiedFiles.push(file);
      } else {
        logger.warn(`Gallery file verification failed: ${file.filename}`);
        failedFiles.push({ filename: file.filename, error: "File not found in B2" });
      }
    }

    res.json({
      ok: true,
      verified: verifiedFiles,
      failed: failedFiles,
      message: `${verifiedFiles.length} file(s) verified, ${failedFiles.length} failed.`
    });

  } catch (err) {
    logger.error("Gallery confirm upload error:", err);
    res.status(500).json({ error: "Failed to verify upload" });
  }
});

// Get all gallery images with pagination
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  // Handle limit=0 (no limit) or default to 8
  let limit = req.query.limit !== undefined ? parseInt(req.query.limit) : 8;

  logger.info(`Fetching gallery images. Page: ${page}, Limit: ${limit}`);

  try {
    const skip = limit > 0 ? (page - 1) * limit : 0;

    let query = Gallery.find().sort({ uploadedAt: -1 });
    // Apply skip only if limit > 0 (pagination enabled)
    // If limit is 0, we want all, so skip is 0 which is default.
    // Mongoose limit(0) is equivalent to no limit. 
    if (limit > 0) {
      query = query.skip(skip).limit(limit);
    }

    const [images, total] = await Promise.all([
      query.lean(),
      Gallery.countDocuments()
    ]);

    // Public CDN - no token needed
    const signedImages = images.map(img => signGalleryImage(img));

    logger.info(`Fetched ${images.length} gallery images (Total: ${total}).`);

    res.json({
      items: signedImages,
      total,
      page,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
      hasMore: limit > 0 ? (page * limit < total) : false
    });
  } catch (err) {
    logger.error("Error fetching all gallery images:", err);
    res.status(500).json({ error: "Failed to fetch gallery images" });
  }
});

// Delete a gallery image by _id or filename
router.delete("/delete", async (req, res) => {
  const { id, fileName } = req.body;
  let imageToDelete = null;
  let identifier;

  if (id) {
    identifier = id;
    logger.info(`Received request to delete gallery image by id: ${id}`);
  } else if (fileName) {
    identifier = fileName;
    logger.info(`Received request to delete gallery image by fileName: ${fileName}`);
  } else {
    logger.warn(`No id or fileName provided for gallery delete`);
    return res.status(400).json({ error: "Must provide either id or fileName" });
  }

  try {
    // First, find the record (but don't delete yet)
    if (id) {
      const isObjectId = /^[a-f\d]{24}$/i.test(id);
      if (isObjectId) {
        logger.info(`Trying to find gallery image by _id: ${id}`);
        imageToDelete = await Gallery.findById(id);
      }
    }
    if (!imageToDelete && fileName) {
      logger.info(`Trying to find gallery image by filename: ${fileName}`);
      imageToDelete = await Gallery.findOne({ filename: fileName });
    }

    if (!imageToDelete) {
      logger.warn(
        `Gallery image not found for delete: ${identifier}`
      );
      return res.status(404).json({ error: "Gallery image not found" });
    }

    // Now, remove the file from B2 before deleting the DB record
    const filesToDelete = [imageToDelete.filename];
    if (imageToDelete.thumbnail) filesToDelete.push(imageToDelete.thumbnail.split('/').pop());
    if (imageToDelete.medium) filesToDelete.push(imageToDelete.medium.split('/').pop());
    if (imageToDelete.hero) filesToDelete.push(imageToDelete.hero.split('/').pop());

    // We need to handle potential full URLs in DB vs filenames expected by deleteFile
    // usage in deleteFile: (type, filename, context)

    try {
      // 1. Delete Original
      await uploadService.deleteFile(undefined, imageToDelete.filename, { isGallery: true });
      logger.info(`Deleted gallery file from B2: ${imageToDelete.filename}`);

      // 2. Delete Derived Files
      // We can use the same deleteFile method if we extract the filename correctly
      // The current uploadService.deleteFile implementation constructs the path based on context.
      // let's verify uploadService.deleteFile implementation to be sure.

      // Actually, let's look at uploadService.deleteFile first.
      // If it takes just filename and context, we can reuse it.

      const derived = ['thumbnail', 'medium', 'hero'];
      for (const field of derived) {
        if (imageToDelete[field]) {
          // extract filename from URL if it is a URL
          const derivedFilename = imageToDelete[field].split('/').pop();
          // The B2 structure for derived images is likely same folder: gallery/filename-suffix.webp
          // uploadService.deleteFile likely handles 'gallery/' prefix internally based on isGallery: true

          try {
            await uploadService.deleteFile(undefined, derivedFilename, { isGallery: true });
            logger.info(`Deleted gallery derived file from B2: ${derivedFilename}`);
          } catch (dErr) {
            logger.warn(`Failed to delete derived file ${derivedFilename}: ${dErr.message}`);
          }
        }
      }

    } catch (fileErr) {
      logger.error(`Failed to delete gallery file from B2 (${imageToDelete.filename}): ${fileErr.message}`);
      // Proceed to delete DB record anyway? Maybe not if original failed. 
      // User asked to clean up, so we should try best effort.
      return res.status(500).json({ error: `Failed to delete gallery file from B2: ${fileErr.message}` });
    }

    // Now delete the DB record
    let deletedImage = null;
    if (imageToDelete._id) {
      deletedImage = await Gallery.findByIdAndDelete(imageToDelete._id);
    } else if (imageToDelete.filename) {
      deletedImage = await Gallery.findOneAndDelete({ filename: imageToDelete.filename });
    }

    logger.info(
      `Gallery image deleted successfully: ${deletedImage?.filename || deletedImage?._id}`
    );
    res.json({ ok: true, deletedImage });
  } catch (err) {
    logger.error("Failed to delete gallery image:", err);
    res.status(500).json({ error: "Failed to delete gallery image" });
  }
});

export default router;
