import express from "express";
import multer from "multer";
import Film from "../models/Film.js";
const router = express.Router();
import Credential from "../config/Credentials.js"
import path  from "path";
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";
import { requireAdminAuth, requireAdminOrEditorAuth } from "../middleware/auth.js";
import { extractThumbnailForFilmsService } from '../services/videoService.js';
import b2 from "../services/b2.service.js";
import websocketService from "../services/websocket.service.js";

const signFilm = (film, tokenData) => {
    if (!film || !tokenData) return film;
    const { baseDownloadUrl, authorizationToken, bucketName } = tokenData;
    const sign = (filename) => `${baseDownloadUrl}/file/${bucketName}/films/${filename}?Authorization=${authorizationToken}`;
    const newFilm = (typeof film.toObject === 'function') ? film.toObject() : { ...film };
    if (newFilm.filename) newFilm.url = sign(newFilm.filename);
    if (newFilm.thumbnailFilename) newFilm.thumbnail = sign(newFilm.thumbnailFilename);
    return newFilm;
};

// Upload video with description
// Prepare Direct Upload
router.post("/prepare-direct-upload", async (req, res) => {
  try {
    // Films usually single upload in existing code, but let's support array or just handle one
    // Frontend sends 'files' array usually in our new service structure.
    const { files } = req.body; 
    if (!files || !files.length) {
        return res.status(400).json({ error: "No files provided" });
    }

    const uploadSlots = [];
    for (const file of files) {
        if (!allowedExtensions.videos.includes(file.mimetype)) {
             logger.warn(`Blocked film upload of unsupported type: ${file.mimetype}`);
             continue; 
        }

        const context = { type: 'film' };
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
    logger.error("Film prepare upload error:", err);
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
            const context = { type: 'film' };
            const { exists } = await uploadService.verifyFileExists(context, file.filename);
            
            if (exists) {
                verifiedFiles.push(file);
            } else {
                logger.warn(`Film file verification failed: ${file.filename}`);
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
        logger.error("Film confirm upload error:", err);
        res.status(500).json({ error: "Failed to verify upload" });
    }
});

// Get all films
router.get("/", async (req, res) => {
  logger.info("Fetching all films.");
  try {
    const films = await Film.find().sort({ uploadedAt: -1 });

    const tokenData = await b2.getFolderToken("films/");
    const signedFilms = films.map(f => signFilm(f, tokenData));

    // Add cache headers for Layer 1 caching (2 hours for video metadata)
    res.setHeader('Cache-Control', 'public, max-age=7200'); // 2 hours
    res.setHeader('Vary', 'Authorization');

    logger.info(`Fetched ${films.length} films.`);
    res.json(signedFilms);
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

    // Now, remove the file from B2 before deleting the DB record
    try {
      // Delete main film file
      await uploadService.deleteFile(undefined, filmToDelete.filename, { isFilm: true });
      logger.info(`Deleted film file from B2: ${filmToDelete.filename}`);

      // Delete thumbnail if it exists
      if (filmToDelete.thumbnailFilename) {
          try {
              await uploadService.deleteFile(undefined, filmToDelete.thumbnailFilename, { isFilm: true });
              logger.info(`Deleted associated film thumbnail from B2: ${filmToDelete.thumbnailFilename}`);
          } catch (thumbErr) {
              logger.error(`Failed to delete film thumbnail ${filmToDelete.thumbnailFilename} from B2: ${thumbErr.message}`);
          }
      }
    } catch (fileErr) {
      logger.error(`Failed to delete film file from B2 (${filmToDelete.filename}): ${fileErr.message}`);
      return res.status(500).json({ error: `Failed to delete film file from B2: ${fileErr.message}` });
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
      const oldFilename = film.thumbnailFilename;
      try {
        await uploadService.deleteFile(undefined, oldFilename, { isFilm: true });
        logger.info(`Deleted old film thumbnail ${oldFilename} from B2`);
      } catch (err) {
        logger.warn(`Failed to delete old film thumbnail ${oldFilename} from B2: ${err.message}`);
      }
    }

    // Update film document with new thumbnail info
    film.thumbnail = thumbnailResult.thumbnailUrl;
    film.thumbnailFilename = thumbnailResult.thumbnailFilename;
    await film.save();

    logger.info(`Thumbnail extracted and set for film ${film.filename} (${film._id})`);
    
    const signedThumbnail = await b2.getPresignedUrl(`films/${thumbnailResult.thumbnailFilename}`);

    return res.json({
      ok: true,
      thumbnail: signedThumbnail,
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


export default router;
