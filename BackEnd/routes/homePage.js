import express from "express";
import multer from "multer";
import HomePage from "../models/HomePage.js";
const router = express.Router();
import path from "path";
import Credential from "../config/Credentials.js";
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";
import b2 from "../services/b2.service.js";
import websocketService from "../services/websocket.service.js";

const signHomePageImage = (image) => {
  if (!image) return image;

  const cdnUrl = Credential.OFFICIAL_CDN_URL;
  const bucketName = Credential.B2_BUCKET_NAME;

  const sign = (filename) => `${cdnUrl}/file/${bucketName}/homepage/${encodeURIComponent(filename)}`;

  const newImage = (typeof image.toObject === 'function') ? image.toObject() : { ...image };
  if (newImage.filename) {
    newImage.url = sign(newImage.filename);
  }

  const derived = ['thumbnail', 'medium', 'hero'];
  derived.forEach(field => {
    if (newImage[field]) {
      const parts = newImage[field].split('/');
      const filename = parts.pop();
      if (filename) {
        newImage[field] = sign(filename);
      }
    }
  });

  return newImage;
};

// Upload image to home page

// Prepare Direct Upload
router.post("/prepare-direct-upload", async (req, res) => {
  try {
    const { files } = req.body; // Expects array of { originalname, mimetype, size }
    if (!files || !files.length) {
      return res.status(400).json({ error: "No files provided" });
    }

    const uploadSlots = [];
    const duplicates = [];
    for (const file of files) {
      // Enforce validations (mime type check is good here too)
      if (!allowedExtensions.images.includes(file.mimetype)) {
        logger.warn(`Blocked homepage upload of unsupported type: ${file.mimetype}`);
        continue;
      }

      const context = { type: 'homepage' };
      const slot = await uploadService.prepareDirectUpload(context, { originalName: file.originalname });

      if (slot.exists) {
        duplicates.push({
          originalName: file.originalname,
          filename: slot.filename,
          key: slot.key,
          mimetype: file.mimetype,
          exists: true
        });
        logger.warn(`Duplicate homepage file detected: ${file.originalname}`);
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
    logger.error("HomePage prepare upload error:", err);
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
      const context = { type: 'homepage' };
      const { exists } = await uploadService.verifyFileExists(context, file.filename);

      if (exists) {
        verifiedFiles.push(file);
      } else {
        logger.warn(`HomePage file verification failed: ${file.filename}`);
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
    logger.error("HomePage confirm upload error:", err);
    res.status(500).json({ error: "Failed to verify upload" });
  }
});

// Get all homePage images with pagination
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 8;

  logger.info(`Fetching homePage images. Page: ${page}, Limit: ${limit}`);

  try {
    const skip = (page - 1) * limit;

    // Run count and find in parallel for performance
    const [images, total] = await Promise.all([
      HomePage.find().sort({ uploadedAt: -1 }).skip(skip).limit(limit),
      HomePage.countDocuments()
    ]);

    // Public CDN - no token needed
    const signedImages = images.map(img => signHomePageImage(img));

    logger.info(`Fetched ${images.length} homePage images (Total: ${total}).`);

    res.json({
      items: signedImages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    });
  } catch (err) {
    logger.error("Error fetching homePage images:", err);
    res.status(500).json({ error: "Failed to fetch homePage images" });
  }
});

// Delete a homePage image by _id or filename
router.delete("/delete", async (req, res) => {
  const { id, fileName } = req.body;
  let imageToDelete = null;
  let identifier;

  if (id) {
    identifier = id;
    logger.info(`Received request to delete homePage image by id: ${id}`);
  } else if (fileName) {
    identifier = fileName;
    logger.info(`Received request to delete homePage image by fileName: ${fileName}`);
  } else {
    logger.warn(`No id or fileName provided for homePage delete`);
    return res.status(400).json({ error: "Must provide either id or fileName" });
  }

  try {
    // First, find the record (but don't delete yet)
    if (id) {
      const isObjectId = /^[a-f\d]{24}$/i.test(id);
      if (isObjectId) {
        logger.info(`Trying to find homePage image by _id: ${id}`);
        imageToDelete = await HomePage.findById(id);
      }
    }
    if (!imageToDelete && fileName) {
      logger.info(`Trying to find homePage image by filename: ${fileName}`);
      imageToDelete = await HomePage.findOne({ filename: fileName });
    }

    if (!imageToDelete) {
      logger.warn(
        `HomePage image not found for delete: ${identifier}`
      );
      return res.status(404).json({ error: "HomePage image not found" });
    }

    // Now, remove the file from B2 before deleting the DB record
    try {
      // 1. Delete Original
      await uploadService.deleteFile(undefined, imageToDelete.filename, { isHomePage: true });
      logger.info(`Deleted homePage file from B2: ${imageToDelete.filename}`);

      // 2. Delete Derived Files
      const derived = ['thumbnail', 'medium', 'hero'];
      for (const field of derived) {
        if (imageToDelete[field]) {
          const derivedFilename = imageToDelete[field].split('/').pop();
          try {
            await uploadService.deleteFile(undefined, derivedFilename, { isHomePage: true });
            logger.info(`Deleted homePage derived file from B2: ${derivedFilename}`);
          } catch (dErr) {
            logger.warn(`Failed to delete derived file ${derivedFilename}: ${dErr.message}`);
          }
        }
      }
    } catch (fileErr) {
      logger.error(`Failed to delete homePage file from B2 (${imageToDelete.filename}): ${fileErr.message}`);
      return res.status(500).json({ error: `Failed to delete homePage file from B2: ${fileErr.message}` });
    }

    // Now delete the DB record
    let deletedImage = null;
    if (imageToDelete._id) {
      deletedImage = await HomePage.findByIdAndDelete(imageToDelete._id);
    } else if (imageToDelete.filename) {
      deletedImage = await HomePage.findOneAndDelete({ filename: imageToDelete.filename });
    }

    logger.info(
      `HomePage image deleted successfully: ${deletedImage?.filename || deletedImage?._id}`
    );
    res.json({ ok: true, deletedImage });
  } catch (err) {
    logger.error("Failed to delete homePage image:", err);
    res.status(500).json({ error: "Failed to delete homePage image" });
  }
});

export default router;

