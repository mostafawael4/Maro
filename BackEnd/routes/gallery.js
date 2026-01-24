import express from "express";
import multer from "multer";
import Gallery from "../models/Gallery.js";
const router = express.Router();
import path  from "path";
import Credential from "../config/Credentials.js"
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";
import b2 from "../services/b2.service.js";

const signGalleryImage = (image, tokenData) => {
    if (!image || !tokenData) return image;
    const { baseDownloadUrl, authorizationToken, bucketName } = tokenData;
    const sign = (filename) => `${baseDownloadUrl}/file/${bucketName}/gallery/${filename}?Authorization=${authorizationToken}`;
    const newImage = (typeof image.toObject === 'function') ? image.toObject() : { ...image };
    if (newImage.filename) newImage.url = sign(newImage.filename);
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
    for (const file of files) {
        if (!allowedExtensions.images.includes(file.mimetype)) {
             logger.warn(`Blocked gallery upload of unsupported type: ${file.mimetype}`);
             continue; 
        }

        const context = { type: 'gallery' };
        const slot = await uploadService.prepareDirectUpload(context, { originalName: file.originalname });
        
        uploadSlots.push({
            originalName: file.originalname,
            filename: slot.filename,
            key: slot.key,
            uploadUrl: slot.uploadUrl,
            authorizationToken: slot.authorizationToken,
            mimetype: file.mimetype
        });
    }

    res.json({ ok: true, uploadSlots });
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

        const results = [];
        for (const file of uploadedFiles) {
            const context = { type: 'gallery' };
            const { exists, url } = await uploadService.verifyFileExists(context, file.filename);
            
            if (!exists) {
                logger.warn(`Gallery file verification failed: ${file.filename}`);
                continue;
            }

            const newImage = await Gallery.create({
                filename: file.filename,
                url: url,
                uploadedAt: new Date(),
            });
            logger.info(`Gallery image record created: ${newImage.filename}`);
            results.push(newImage);
        }
        
        const tokenData = await b2.getFolderToken("gallery/");
        const signedResults = results.map(img => signGalleryImage(img, tokenData));

        res.status(201).json({ 
            ok: true, 
            added: signedResults,
            message: `${results.length} file(s) confirmed.` 
        });

    } catch (err) {
        logger.error("Gallery confirm upload error:", err);
        res.status(500).json({ error: "Failed to confirm upload" });
    }
});

// Get all gallery images
router.get("/", async (req, res) => {
  logger.info("Fetching all gallery images.");
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 }).lean();
    
    // Get token for gallery prefix
    const tokenData = await b2.getFolderToken("gallery/");
    const signedImages = images.map(img => signGalleryImage(img, tokenData));

    logger.info(`Fetched ${images.length} gallery images.`);
    res.json(signedImages);
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
    try {
      await uploadService.deleteFile(undefined, imageToDelete.filename, { isGallery: true });
      logger.info(`Deleted gallery file from B2: ${imageToDelete.filename}`);
    } catch (fileErr) {
      logger.error(`Failed to delete gallery file from B2 (${imageToDelete.filename}): ${fileErr.message}`);
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
