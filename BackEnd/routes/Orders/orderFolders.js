import express from "express";
const router = express.Router();
import mongoose from "mongoose";
import Order from "../../models/order.js";
import { requireAdminAuth } from "../../middleware/auth.js";
import uploadService from "../../services/upload.service.js";
import multer from "multer";
import allowedExtensions from "../../config/allowed_extensions.js";
import logger from "../../utils/logger.js";
import { handleMulterErrors } from "../../middleware/upload.js";
import { deleteOrderFileByFileName } from "../../services/order.service.js";
import Credentials from '../../config/Credentials.js';
import { signOrderFiles } from "../../utils/signingUtils.js";
import archiver from 'archiver';
import b2 from '../../services/b2.service.js';


// GET /:orderId - return order's folders count and names (admin only)
router.get("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Use distinct to get unique folder names directly from MongoDB
    const folders = await Order.distinct("media.foldername", { _id: orderId });

    return res.json({
      ok: true,
      count: folders.length,
      folders: folders
    });
  } catch (err) {
    logger.error(`GET /${req.params.orderId}/folders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

router.get("/:orderId/:foldername", requireAdminAuth, async (req, res) => {
  const { orderId, foldername } = req.params

  try {
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const filteredMedia = result[0].media || [];
    const signedMedia = await signOrderFiles(orderId, filteredMedia);

    return res.json({
      ok: true,
      foldername,
      count: signedMedia.length,
      media: signedMedia
    });

  } catch (err) {
    logger.error(`GET /${orderId}/${foldername} failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
})

// DELETE /:orderId/folder/:foldername - delete all files in a folder for a given order
router.delete("/:orderId/:foldername", requireAdminAuth, async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  try {
    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaInFolder = result[0].media || [];
    if (mediaInFolder.length === 0) {
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}' for order ${orderId}` });
    }
    const filenames = mediaInFolder.map(item => item.filename);

    // Delete all files in the folder
    const failedDeletions = [];
    for (const filename of filenames) {
      try {
        await deleteOrderFileByFileName(orderId, filename);
      } catch (deleteErr) {
        logger.error(`Error deleting file '${filename}' in folder '${foldername}' for orderId ${orderId}: ${deleteErr.stack || deleteErr.message || deleteErr}`);
        failedDeletions.push({ filename, error: deleteErr.message || deleteErr });
      }
    }

    if (failedDeletions.length > 0) {
      return res.status(500).json({
        ok: false,
        message: `Failed to delete some files in folder '${foldername}' for order ${orderId}`,
        failedFiles: failedDeletions
      });
    }

    return res.json({ ok: true, orderId, foldername, deletedCount: filenames.length });
  } catch (err) {
    logger.error(`DELETE /${orderId}/folder/${foldername} failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});


// GET /:orderId/:foldername/download - stream folder as zip file (admin only)
router.get("/:orderId/:foldername/download", async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    logger.warn(`Download folder request missing orderId or foldername`);
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  try {
    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      logger.warn(`Order not found for folder download: ${orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaInFolder = result[0].media || [];

    if (mediaInFolder.length === 0) {
      logger.warn(`No media found in folder '${foldername}' for order ${orderId}`);
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}'` });
    }

    logger.info(`Starting streaming zip download for folder '${foldername}' in order ${orderId} (${mediaInFolder.length} files)`);

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${foldername}.zip"`);

    // Create archiver instance with NO compression for speed
    const archive = archiver('zip', {
      zlib: { level: 6 }, // No compression - media files don't compress well anyway
      store: true // Use store mode for maximum speed
    });

    // Pipe archive to response
    archive.pipe(res);

    // Handle archiver errors
    archive.on('error', (err) => {
      logger.error(`Archiver error for folder '${foldername}' in order ${orderId}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Failed to create zip file' });
      }
    });

    // Disable timeout for this request as it involves streaming large amount of data
    req.setTimeout(0);

    // Track progress
    let processedFiles = 0;

    // Process files sequentially to avoid opening too many connections (which causes timeouts)
    for (const media of mediaInFolder) {
      try {
        const key = `orders/${orderId}/${media.filename}`;
        const fileName = media.originalName || media.filename;

        // Get stream from B2
        const fileStream = await b2.downloadFileStream(key);

        // Append to archive and wait for it to be consumed
        // This ensures we don't open the next B2 connection until the current one is done
        await new Promise((resolve, reject) => {
          fileStream.on('end', () => {
            processedFiles++;
            // Log every 5 files to avoid spamming logs, or if it's the last one
            if (processedFiles % 5 === 0 || processedFiles === mediaInFolder.length) {
              logger.info(`Streamed file ${processedFiles}/${mediaInFolder.length}: ${fileName}`);
            }
            resolve();
          });

          fileStream.on('error', (err) => {
            logger.error(`Stream error for ${fileName}: ${err.message}`);
            // Don't reject, just resolve so we continue to next file (partial zip is better than no zip)
            resolve();
          });

          archive.append(fileStream, { name: fileName });
        });

      } catch (error) {
        logger.error(`Failed to process file ${media.filename}: ${error.message}`);
        // Continue with other files
      }
    }

    // Finalize the archive (this triggers the stream to complete)
    await archive.finalize();

    logger.info(`Successfully streamed zip for folder '${foldername}' in order ${orderId} (${processedFiles}/${mediaInFolder.length} files)`);
    return res.end();
  } catch (err) {
    logger.error(`GET /:orderId/:foldername/download failed: ${err.stack || err}`);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error", error: err.message });
    }
  }
});


export default router;
