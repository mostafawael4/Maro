const express = require("express");
const multer = require("multer");
const Film = require("../models/Film");
const router = express.Router();
const uploadService = require("../services/upload.service");
const allowedExtensions = require("../config/allowed_extensions");
const { handleMulterErrors } = require("../middleware/upload").default;
const logger = require("../utils/logger");

// ✅ Upload video with description
const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [...allowedExtensions.videos];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files are allowed!"));
  },
}).single("videos");
router.post("/upload", uploadMemory, handleMulterErrors, async (req, res) => {
  logger.info("Received film upload request.");
  try {
    const file = req.file;
    const { description } = req.body;

    if (!file) {
      logger.warn("No file uploaded in film upload.");
      return res.status(400).json({ error: "No file uploaded" });
    }

    logger.info(`Processing file for film upload: ${file.originalname}`);

    const fileUrl = uploadService.saveFile(
      undefined,
      file.buffer,
      file.originalname,
      { isFilm: true }
    );
    logger.info(`Saved film file: ${fileUrl}`);

    // Optionally generate/save unique filename with timestamp if desired
    const newFilm = await Film.create({
      filename: file.originalname || file.filename,
      url: fileUrl,
      description,
    });

    logger.info(`Film record created: ${newFilm.filename}`);

    res.status(201).json(newFilm);
  } catch (err) {
    logger.error("Film upload error:", err);
    res.status(500).json({ error: "Failed to upload video" });
  }
});

// ✅ Get all films
router.get("/", async (req, res) => {
  logger.info("Fetching all films.");
  try {
    const films = await Film.find().sort({ uploadedAt: -1 });
    logger.info(`Fetched ${films.length} films.`);
    res.json(films);
  } catch (err) {
    logger.error("Error fetching films:", err);
    res.status(500).json({ error: "Failed to fetch films" });
  }
});

module.exports = router;
