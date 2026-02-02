import express from "express";
const router = express.Router();
import Order from "../../models/order.js";
import { requireAdminAuth } from "../../middleware/auth.js";
import uploadService from "../../services/upload.service.js";
import multer from "multer";
import allowedExtensions from "../../config/allowed_extensions.js";
import logger from "../../utils/logger.js";
import { handleMulterErrors } from "../../middleware/upload.js";
import { deleteOrderFileByFileName } from "../../services/order.service.js";
import Credentials  from '../../config/Credentials.js';
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

    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Extract unique folder names from order.media
    const foldersSet = new Set();
    if (Array.isArray(order.media)) {
      order.media.forEach(item => {
        if (item.foldername) {
          foldersSet.add(item.foldername);
        }
      });
    }
    const folders = Array.from(foldersSet);

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

    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Get the media in this order where foldername equals foldername param
    const filteredMedia = Array.isArray(order.media)
      ? order.media.filter(item => item.foldername === foldername)
      : [];

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
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Find filenames belonging to the folder
    const mediaInFolder = Array.isArray(order.media)
      ? order.media.filter(item => item.foldername === foldername)
      : [];
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
    const order = await Order.findById(orderId).lean();
    if (!order) {
      logger.warn(`Order not found for folder download: ${orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Filter media for this folder
    const mediaInFolder = Array.isArray(order.media)
      ? order.media.filter(item => item.foldername === foldername)
      : [];

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

    // Track progress
    let processedFiles = 0;
    const concurrency = 5; // Process 5 files in parallel for speed

    // Process files in parallel batches
    for (let i = 0; i < mediaInFolder.length; i += concurrency) {
      const batch = mediaInFolder.slice(i, Math.min(i + concurrency, mediaInFolder.length));
      
      // Process batch in parallel
      await Promise.all(batch.map(async (media) => {
        try {
          const key = `orders/${orderId}/${media.filename}`;
          const fileName = media.originalName || media.filename;
          
          logger.info(`Streaming file ${processedFiles + 1}/${mediaInFolder.length}: ${fileName}`);
          
          // Get stream from B2
          const fileStream = await b2.downloadFileStream(key);
          
          // Add stream to archive
          archive.append(fileStream, { name: fileName });
          
          processedFiles++;
        } catch (error) {
          logger.error(`Failed to stream file ${media.filename} from B2: ${error.message}`);
          // Continue with other files even if one fails
        }
      }));
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
