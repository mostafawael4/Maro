const express = require('express');
const multer = require('multer');
const Film = require('../models/Film');
const router = express.Router();
const uploadService = require("../services/upload.service");
const allowedExtensions = require('../config/allowed_extensions');

// ✅ Upload video with description
const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [
      ...allowedExtensions.videos,
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only video files are allowed!"));
  },
});
router.post('/upload', uploadMemory.single('videos'), async (req, res) => {
  try {
    const file = req.file;
    const { description } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = uploadService.saveFile(undefined, file.buffer, file.originalname, { isFilm: true });
    // Optionally generate/save unique filename with timestamp if desired
    const newFilm = await Film.create({
      filename: file.originalname || file.filename,
      url: fileUrl,
      description
    });

    res.status(201).json(newFilm);
  } catch (err) {
    console.error('Film upload error:', err);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// ✅ Get all films
router.get('/', async (req, res) => {
  const films = await Film.find().sort({ uploadedAt: -1 });
  res.json(films);
});

module.exports = router;
