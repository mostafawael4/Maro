const express = require("express");
const router = express.Router();
const ftpService = require("../services/ftp.service");
const logger = require("../utils/logger");

// GET /api/upload-progress/:uploadId - Get upload progress
router.get("/:uploadId", async (req, res) => {
  try {
    const { uploadId } = req.params;
    const progress = ftpService.getProgress(uploadId);

    if (!progress) {
      return res.status(404).json({
        ok: false,
        message:
          "Upload progress not found. Upload may have completed or expired.",
      });
    }

    return res.json({
      ok: true,
      progress: {
        loaded: progress.loaded,
        total: progress.total,
        percentage: progress.percentage,
        speed: progress.speed, // bytes per second
        elapsed: progress.elapsed, // seconds
        status: progress.status, // 'connecting', 'uploading', 'completed', 'error'
        filename: progress.filename,
        error: progress.error || null,
      },
    });
  } catch (err) {
    logger.error(
      `GET /upload-progress/${req.params.uploadId} failed: ${err.message}`
    );
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});

module.exports = router;
