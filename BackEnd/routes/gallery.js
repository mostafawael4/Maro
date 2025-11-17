const express = require("express");
const multer = require("multer");
const Gallery = require("../models/Gallery");
const router = express.Router();
const uploadService = require("../services/upload.service");
const allowedExtensions = require("../config/allowed_extensions");
const { handleMulterErrors } = require("../middleware/upload").default;
const logger = require("../utils/logger");

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

// Get random images (for homepage)
router.get("/random", async (req, res) => {
  // Get the 'numImages' parameter from the frontend query (if not provided, default to 6)
  const numImages = parseInt(req.query.numImages, 10) || 6;
  logger.info(`Fetching ${numImages} random gallery images.`);
  try {
    const images = await Gallery.aggregate([{ $sample: { size: numImages } }]);
    logger.info(
      `Fetched ${images.length} random gallery images for homepage.`
    );
    res.json(images);
  } catch (err) {
    logger.error("Error fetching random gallery images:", err);
    res.status(500).json({ error: "Failed to fetch random images" });
  }
});

module.exports = router;
