const express = require("express");
const multer = require("multer");
const Gallery = require("../models/Gallery");
const router = express.Router();
const path  = require("path");
const Credential = require("../config/Credentials")
const uploadService = require("../services/upload.service");
const allowedExtensions = require("../config/allowed_extensions");
const logger = require("../utils/logger");
const { handleMulterErrors } = require("../middleware/upload").default;
const { deleteFileByPath } = require("../utils/fileProccess");

// Upload image to gallery

const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [...allowedExtensions.images];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed!"));
  },
}).array("images", 50);

router.post("/upload", uploadMemory, handleMulterErrors, async (req, res) => {
  logger.info("Received gallery upload request.");
  try {
    const files = req.files || [];
    if (!files.length) {
      logger.warn("No files uploaded in gallery upload.");
      return res.status(400).json({ error: "No files uploaded" });
    }
    const results = [];
    for (const file of files) {
      logger.info(`Processing file for gallery upload: ${file.originalname}`);
      const fileUrl = uploadService.saveFile(
        undefined,
        file.buffer,
        file.originalname,
        { isGallery: true }
      );
      logger.info(`Saved gallery file: ${fileUrl}`);

      // Optionally save to Gallery collection:
      const newImage = await Gallery.create({
        filename: fileUrl.split("/").pop(),
        url: fileUrl,
        uploadedAt: new Date(),
      });
      logger.info(`Gallery image record created: ${newImage.filename}`);
      results.push(newImage);
    }
    logger.info(
      `Gallery upload successful. Total images uploaded: ${results.length}`
    );
    res
      .status(201)
      .json(
        Array.isArray(results) && results.length === 1 ? results[0] : results
      );
  } catch (err) {
    logger.error("Gallery upload error:", err);
    res.status(500).json({ error: "Failed to upload image to gallery" });
  }
});

// Get all gallery images
router.get("/", async (req, res) => {
  logger.info("Fetching all gallery images.");
  try {
    const images = await Gallery.find().sort({ uploadedAt: -1 });
    logger.info(`Fetched ${images.length} gallery images.`);
    res.json(images);
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

    // Now, remove the file from disk before deleting the DB record
    const uploadsDir = Credential.UPLOAD_DIR_GALLERY;
    const filePath = path.resolve(uploadsDir, imageToDelete.filename);
    try {
      await deleteFileByPath(filePath);
      logger.info(`Deleted gallery file from disk: ${imageToDelete.filename}`);
    } catch (fileErr) {
      logger.error(`Failed to delete gallery file from disk (${imageToDelete.filename}): ${fileErr.message}`);
      return res.status(500).json({ error: `Failed to delete gallery file from disk: ${fileErr.message}` });
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

module.exports = router;
