const express = require("express");
const multer = require("multer");
const Gallery = require("../models/Gallery");
const router = express.Router();
const uploadService = require("../services/upload.service");
const allowedExtensions = require("../config/allowed_extensions");
const { handleMulterErrors } = require("../middleware/upload").default;

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
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    const results = [];
    for (const file of files) {
      const fileUrl = uploadService.saveFile(
        undefined,
        file.buffer,
        file.originalname,
        { isGallery: true }
      );
      // Optionally save to Gallery collection:
      const newImage = await Gallery.create({
        filename: fileUrl.split("/").pop(),
        url: fileUrl,
        uploadedAt: new Date(),
      });
      results.push(newImage);
    }
    res
      .status(201)
      .json(
        Array.isArray(results) && results.length === 1 ? results[0] : results
      );
  } catch (err) {
    console.error("Gallery upload error:", err);
    res.status(500).json({ error: "Failed to upload image to gallery" });
  }
});

// Get all gallery images
router.get("/", async (req, res) => {
  const images = await Gallery.find().sort({ uploadedAt: -1 });
  res.json(images);
});

// Get random images (for homepage)
router.get("/random", async (req, res) => {
  // Get the 'numImages' parameter from the frontend query (if not provided, default to 6)
  const numImages = parseInt(req.query.numImages, 10) || 6;
  try {
    const images = await Gallery.aggregate([{ $sample: { size: numImages } }]);
    res.json(images);
  } catch (err) {
    console.error("Error fetching random gallery images:", err);
    res.status(500).json({ error: "Failed to fetch random images" });
  }
});

module.exports = router;
