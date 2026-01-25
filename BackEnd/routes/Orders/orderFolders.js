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

    // Add cache headers for Layer 1 caching
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.setHeader('Vary', 'Authorization');

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

    // Add cache headers for Layer 1 caching
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.setHeader('Vary', 'Authorization');

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




export default router;
