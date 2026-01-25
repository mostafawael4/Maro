import express from "express";
import multer from "multer";
import HomePage from "../models/HomePage.js";
const router = express.Router();
import path  from "path";
import Credential from "../config/Credentials.js";
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";
import b2 from "../services/b2.service.js";
import websocketService from "../services/websocket.service.js";

const signHomePageImage = (image, tokenData) => {
    if (!image || !tokenData) return image;
    const { baseDownloadUrl, authorizationToken, bucketName } = tokenData;
    const sign = (filename) => `${baseDownloadUrl}/file/${bucketName}/homepage/${filename}?Authorization=${authorizationToken}`;
    const newImage = (typeof image.toObject === 'function') ? image.toObject() : { ...image };
    if (newImage.filename) newImage.url = sign(newImage.filename);
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
    for (const file of files) {
        // Enforce validations (mime type check is good here too)
        if (!allowedExtensions.images.includes(file.mimetype)) {
             logger.warn(`Blocked homepage upload of unsupported type: ${file.mimetype}`);
             continue; 
        }

        const context = { type: 'homepage' };
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

// Get all homePage images
router.get("/", async (req, res) => {
  logger.info("Fetching all homePage images.");
  try {
    const images = await HomePage.find().sort({ uploadedAt: -1 });

    const tokenData = await b2.getFolderToken("homepage/");
    const signedImages = images.map(img => signHomePageImage(img, tokenData));



    logger.info(`Fetched ${images.length} homePage images.`);
    res.json(signedImages);
  } catch (err) {
    logger.error("Error fetching all homePage images:", err);
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
      await uploadService.deleteFile(undefined, imageToDelete.filename, { isHomePage: true });
      logger.info(`Deleted homePage file from B2: ${imageToDelete.filename}`);
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

