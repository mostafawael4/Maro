const express = require("express");
const multer = require("multer");
const Film = require("../models/Film");
const router = express.Router();
const Credential = require("../config/Credentials")
const path  = require("path");
const uploadService = require("../services/upload.service");
const allowedExtensions = require("../config/allowed_extensions");
const logger = require("../utils/logger");
const { handleMulterErrors } = require("../middleware/upload").default;
const { requireAdminAuth, requireAdminOrEditorAuth } = require("../middleware/auth.js");
const { deleteFileByPath } = require("../utils/fileProccess");
const { extractThumbnailForFilmsService } = require('../services/videoService');

// Upload video with description
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

    const fileUrl = await uploadService.saveFile(
      undefined,
      file.buffer,
      file.originalname,
      { isFilm: true }
    );
    logger.info(`Saved film file: ${fileUrl}`);

    // Optionally generate/save unique filename with timestamp if desired
    const newFilm = await Film.create({
      filename: fileUrl.split("/").pop(),
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

// Get all films
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

// Delete a film by _id or filename
router.delete("/delete", async (req, res) => {
  const { id, fileName } = req.body;
  let filmToDelete = null;
  let identifier;

  if (id) {
    identifier = id;
    logger.info(`Received request to delete film by id: ${id}`);
  } else if (fileName) {
    identifier = fileName;
    logger.info(`Received request to delete film by fileName: ${fileName}`);
  } else {
    logger.warn(`No id or fileName provided for film delete`);
    return res.status(400).json({ error: "Must provide either id or fileName" });
  }

  try {
    // First, find the record (but don't delete yet)
    if (id) {
      const isObjectId = /^[a-f\d]{24}$/i.test(id);
      if (isObjectId) {
        logger.info(`Trying to find film by _id: ${id}`);
        filmToDelete = await Film.findById(id);
      }
    }
    if (!filmToDelete && fileName) {
      logger.info(`Trying to find film by filename: ${fileName}`);
      filmToDelete = await Film.findOne({ filename: fileName });
    }

    if (!filmToDelete) {
      logger.warn(
        `Film not found for delete: ${identifier}`
      );
      return res.status(404).json({ error: "Film not found" });
    }

    // Now, remove the file from disk before deleting the DB record
    const uploadsDir = Credential.UPLOAD_DIR_FILMS;
    const filePath = path.resolve(uploadsDir, filmToDelete.filename);
    try {
      await deleteFileByPath(filePath);
      logger.info(`Deleted film file from disk: ${filmToDelete.filename}`);
    } catch (fileErr) {
      logger.error(`Failed to delete film file from disk (${filmToDelete.filename}): ${fileErr.message}`);
      return res.status(500).json({ error: `Failed to delete film file from disk: ${fileErr.message}` });
    }

    // Now delete the DB record
    let deletedFilm = null;
    if (filmToDelete._id) {
      deletedFilm = await Film.findByIdAndDelete(filmToDelete._id);
    } else if (filmToDelete.filename) {
      deletedFilm = await Film.findOneAndDelete({ filename: filmToDelete.filename });
    }

    logger.info(
      `Film deleted successfully: ${deletedFilm?.filename || deletedFilm?._id}`
    );
    res.json({ ok: true, deletedFilm });
  } catch (err) {
    logger.error("Failed to delete film:", err);
    res.status(500).json({ error: "Failed to delete film" });
  }
});
// POST /films/:id/thumbnail - admin only: extract thumbnail for a film video
router.post("/:id/thumbnail", requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { timeInSeconds } = req.body; // Time in seconds (optional, default: 1)

    // Find the film by id
    const film = await Film.findById(id);
    if (!film) {
      return res.status(404).json({ ok: false, message: "Film not found" });
    }

    // Extract new thumbnail
    const thumbnailResult = await extractThumbnailForFilmsService(
      film._id.toString(),
      film.filename,
      timeInSeconds
    );

    // Delete old thumbnail if exists
    if (film.thumbnailFilename) {
      const fs = require("fs");
      const path = require("path");
      const UPLOAD_DIR_FILMS = Credential.UPLOAD_DIR_FILMS || "./uploads/films";
      const oldThumbPath = path.resolve(UPLOAD_DIR_FILMS, film.thumbnailFilename);
      if (fs.existsSync(oldThumbPath)) {
        try {
          fs.unlinkSync(oldThumbPath);
        } catch (err) {
          logger.warn(`Failed to delete old film thumbnail: ${oldThumbPath}`);
        }
      }
    }

    // Update film document with new thumbnail info
    film.thumbnail = thumbnailResult.thumbnailUrl;
    film.thumbnailFilename = thumbnailResult.thumbnailFilename;
    await film.save();

    logger.info(`Thumbnail extracted and set for film ${film.filename} (${film._id})`);
    return res.json({
      ok: true,
      thumbnail: thumbnailResult.thumbnailUrl,
      thumbnailFilename: thumbnailResult.thumbnailFilename
    });
  } catch (err) {
    logger.error(`POST /films/:id/thumbnail failed: ${err.stack || err}`);
    return res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.message
    });
  }
});


module.exports = router;
