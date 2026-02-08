import express from "express";
const router = express.Router();
import Order from "../../models/order.js";
import { normalizePricingSelections } from '../../services/pricingService.js';
import { requireAdminAuth, requireAdminOrEditorAuth } from "../../middleware/auth.js";
import { uploadMediaFiles, prepareDirectUploads, confirmDirectUploads } from '../../services/orderMediaService.js';
import { getVideoDurationService, extractThumbnailService } from '../../services/videoService.js';
import multer from "multer";
import allowedExtensions from "../../config/allowed_extensions.js";
import logger from "../../utils/logger.js";
import { handleMulterErrors } from "../../middleware/upload.js";
import * as orderService from "../../services/order.service.js";
import Credentials from '../../config/Credentials.js'
import b2 from "../../services/b2.service.js"
import fs from "fs";
import path from "path";
import archiver from 'archiver';
import { signOrderFiles, signOrderMedia } from "../../utils/signingUtils.js";
import uploadService from "../../services/upload.service.js";
import websocketService from "../../services/websocket.service.js";

// Helper to sign a list of file objects for a specific order
// (Removed local implementation to use utility)


// POST /orders - create a new order (public)
router.post("/", async (req, res) => {
  try {
    const { email, clientName, notes, orderForm } = req.body;
    if (!email) {
      logger.warn("Attempt to create order without email", { body: req.body });
      return res.status(400).json({ ok: false, message: "Email required" });
    }
    if (orderForm && typeof orderForm !== "object") {
      return res.status(400).json({ ok: false, message: "Invalid order form format" });
    }
    // create an order; you may want to check duplicates or generate a separate order code
    let normalizedOrderForm = orderForm;
    if (orderForm?.pricing) {
      const normalizedPricing = await normalizePricingSelections(orderForm.pricing);
      normalizedOrderForm = { ...orderForm };
      if (normalizedPricing) {
        normalizedOrderForm.pricing = normalizedPricing;
      } else {
        delete normalizedOrderForm.pricing;
      }
    }

    const order = await Order.create({
      email,
      clientName,
      notes,
      orderForm: normalizedOrderForm, // store all wedding form data here
    });
    logger.info(`Order created: ${order._id} for email ${email}`);
    return res.json({ ok: true, order });
  } catch (err) {
    logger.error(`POST /orders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /orders - admin only: list all orders
router.get("/", requireAdminOrEditorAuth, async (req, res) => {
  try {
    const list = await Order.find({}).sort({ createdAt: -1 }).lean();

    // Optimize: sharedToken is no longer needed with Public CDN
    const signedList = await Promise.all(list.map(o => signOrderMedia(o)));

    logger.info(
      `Listed all orders by ${req.session && req.session.adminId
        ? req.session.adminId
        : "unknown admin"
      }`
    );
    return res.json({ ok: true, orders: signedList });
  } catch (err) {
    logger.error(`GET /orders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


// Route definitions move to move specific first (Done below)


// GET /order/view?email=...  (public) - returns order images if email found
router.get("/view/by-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      logger.warn("Order view by email attempted without providing email.");
      return res.status(400).json({ ok: false, message: "Email required" });
    }

    // find orders by email. If multiple, you may decide how to handle; here we return most recent
    const sanitizedEmail = email.trim();
    // Case-insensitive and whitespace-tolerant search
    const emailRegex = new RegExp(`^\\s*${sanitizedEmail}\\s*$`, 'i');
    const order = await Order.findOne({ email: emailRegex }).sort({ createdAt: -1 }).lean();

    if (!order) {
      console.error('!!! CLIENT SEARCH FAILED (Single) !!!');
      console.error('Target Email:', `'${sanitizedEmail}'`);
      console.error('Regex Used:', emailRegex);
      const recent = await Order.find({}).sort({ createdAt: -1 }).limit(10).select('email clientName').lean();
      console.error('RECENT ORDERS IN DB:', recent.map(o => ({ id: o._id, email: `'${o.email}'`, name: o.clientName })));
      return res.status(404).json({ ok: false, message: "Order not found" });
    }
    const signedOrder = await signOrderMedia(order);
    logger.info(`Order viewed for email: ${email} (order id: ${order._id})`);
    return res.json({ ok: true, order: signedOrder });
  } catch (err) {
    logger.error(`GET /orders/view/by-email failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /orders/by-email?email=... (public) - returns ALL orders for a given email
router.get("/view/orders-by-email",
  async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ ok: false, message: "Email required" });
      }
      const sanitizedEmail = email.trim();
      // Case-insensitive and whitespace-tolerant search
      const emailRegex = new RegExp(`^\\s*${sanitizedEmail}\\s*$`, 'i');
      const orders = await Order.find({ email: emailRegex }).sort({ createdAt: -1 }).lean();

      if (!orders || orders.length === 0) {
        console.error('!!! CLIENT SEARCH FAILED (All) !!!');
        console.error('Target Email:', `'${sanitizedEmail}'`);
        console.error('Regex Used:', emailRegex);
        const recent = await Order.find({}).sort({ createdAt: -1 }).limit(10).select('email clientName').lean();
        console.error('RECENT ORDERS IN DB:', recent.map(o => ({ id: o._id, email: `'${o.email}'`, name: o.clientName })));
        return res.status(404).json({ ok: false, message: "No orders found for email" });
      }
      const signedOrders = await Promise.all(orders.map(o => signOrderMedia(o)));
      logger.info(`Admin fetched ${orders.length} order(s) by email: ${email}`);
      return res.json({ ok: true, orders: signedOrders });
    } catch (err) {
      logger.error(`GET /orders/by-email failed: ${err.stack || err}`);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);


// --- PARAMETERIZED ROUTES (Move to bottom to prevent shadowing) ---

// GET /orders/:orderId - admin only: fetch specific order
router.get("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      logger.warn(`Order not found: ${req.params.orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }
    const signedOrder = await signOrderMedia(order);
    logger.info(`Order fetched: ${req.params.orderId}`);
    return res.json({ ok: true, order: signedOrder });
  } catch (err) {
    logger.error(
      `GET /orders/${req.params.orderId} failed: ${err.stack || err}`
    );
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// PUT /:orderId (admin only) - update order fields
/**
 * Deeply merges properties from the source object into the target object.
 * - If a property is an object (but not an array), will recursively merge its properties.
 * - Otherwise, will overwrite the value in the target with the source value.
 * - Mutates the target object in-place.
 * 
 * @param {Object} target - The object to merge into (will be mutated).
 * @param {Object} source - The object with new values (will not be mutated).
 */
const deepMerge = (target, source) => {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      // If nested object, recurse
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      // Primitive or array → direct replace
      target[key] = source[key];
    }
  }
}
router.put("/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateFields = req.body;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }
    if (!updateFields || typeof updateFields !== "object" || Array.isArray(updateFields)) {
      return res.status(400).json({ ok: false, message: "You must provide fields to update in request body" });
    }

    // Get the order by orderId before updating
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    if (updateFields.orderForm?.pricing) {
      const normalizedPricing = await normalizePricingSelections(updateFields.orderForm.pricing);
      if (normalizedPricing) {
        updateFields.orderForm.pricing = normalizedPricing;
      } else {
        delete updateFields.orderForm.pricing;
      }
    }

    // Update only the fields sent
    if (updateFields.orderForm) {
      deepMerge(order.orderForm, updateFields.orderForm);
      order.markModified("orderForm");
    }

    // Update root fields (clientName, notes, status, etc.)
    for (const key of Object.keys(updateFields)) {
      if (key !== "orderForm") {
        order[key] = updateFields[key];
      }
    }

    await order.save();

    const updatedOrder = await Order.findById(orderId).lean();

    if (!updatedOrder) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const signedOrder = await signOrderMedia(updatedOrder);

    logger.info(`Order ${orderId} updated by admin.`);
    return res.json({ ok: true, order: signedOrder });
  } catch (err) {
    logger.error(`PUT /orders/:orderId failed: ${err.stack || err.message || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// PUT /orders/:orderId/status - admin only: update status
router.put("/:orderId/status", requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "in-progress", "done"].includes(status)) {
      logger.warn(
        `Invalid status "${status}" set attempt on order ${req.params.orderId}`
      );
      return res.status(400).json({ ok: false, message: "Invalid status" });
    }
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { status },
      { new: true }
    );
    logger.info(`Order ${req.params.orderId} status updated to "${status}"`);
    return res.json({ ok: true, order: updated });
  } catch (err) {
    logger.error(
      `PUT /orders/${req.params.orderId}/status failed: ${err.stack || err}`
    );
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// POST /orders/:orderId/prepare-direct-upload - Get B2 upload tokens and check for duplicates
router.post("/:orderId/prepare-direct-upload", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { files, foldername } = req.body; // files: [{ originalname, mimetype }]

    const result = await prepareDirectUploads(orderId, files, foldername);
    return res.json({ ok: true, ...result });
  } catch (err) {
    logger.error(`POST /orders/${req.params.orderId}/prepare-direct-upload failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /orders/:orderId/confirm-direct-upload - Finalize upload in DB after client finishes B2 upload
router.post("/:orderId/confirm-direct-upload", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { uploadedFiles, foldername } = req.body;

    const result = await confirmDirectUploads(orderId, uploadedFiles, foldername);

    return res.json({
      ok: true,
      verified: result.verified,
      message: `${result.verified.length} file(s) confirmed and processed.`
    });
  } catch (err) {
    logger.error(`POST /orders/${req.params.orderId}/confirm-direct-upload failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Failed to confirm upload", error: err.message });
  }
});

// DELETE /:orderId (admin only) - delete order folder from the server and delete the order from db
router.delete("/:orderId", requireAdminAuth,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        return res.status(400).json({ ok: false, message: "orderId is required" });
      }

      // Use deleteOrderFiles service to remove folder
      try {
        await orderService.deleteOrderfolder(orderId);
      } catch (deleteErr) {
        logger.error(`Error deleting order files for orderId ${orderId}: ${deleteErr.stack || deleteErr.message || deleteErr}`);
        return res.status(500).json({ ok: false, message: "Failed to delete order files", error: deleteErr.message || deleteErr });
      }

      // Delete the order from the database
      const deleted = await Order.findByIdAndDelete(orderId);
      if (!deleted) {
        return res.status(404).json({ ok: false, message: "Order not found" });
      }

      logger.info(`Order and associated files deleted for orderId: ${orderId}`);
      return res.json({ ok: true, orderId });
    } catch (error) {
      logger.error(`DELETE /orders/:orderId failed: ${error.stack || error.message || error}`);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

// DELETE /deletemedia/:orderId (admin only) - delete order files[] from the server and from db by file name
router.delete("/:orderId/deletemedia", requireAdminAuth,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { filenames } = req.body;
      if (!orderId) {
        return res.status(400).json({ ok: false, message: "orderId is required" });
      }
      if (filenames.length <= 0) {
        return res.status(400).json({ ok: false, message: "filenames array is required" });
      }

      // use getOrderFilesPaths to get all files for the order
      let filePaths;
      try {
        filePaths = await orderService.getOrderFilesPaths(orderId);
      } catch (error) {
        logger.error(`Error getting order file paths for orderId ${orderId}: ${error.stack || error.message || error}`);
        return res.status(500).json({ ok: false, message: "Failed to fetch order file paths", error: error.message || error });
      }

      // Validate that all filenames in the array exist in the order's files
      const missingFiles = filenames.filter(filename => !filePaths.includes(filename));
      if (missingFiles.length > 0) {
        logger.error(`Files not found for orderId ${orderId}: ${missingFiles.join(", ")}`);
        return res.status(400).json({ ok: false, message: `Files do not exist for order id ${orderId}: ${missingFiles.join(", ")}` });
      }

      // Attempt to delete each requested file, collect failed deletions
      const failedDeletions = [];
      for (const filename of filenames) {
        try {
          await orderService.deleteOrderFileByFileName(orderId, filename);
        } catch (deleteErr) {
          logger.error(`Error deleting file ${filename} for orderId ${orderId}: ${deleteErr.stack || deleteErr.message || deleteErr}`);
          failedDeletions.push({ filename, error: deleteErr.message || deleteErr });
        }
      }

      if (failedDeletions.length > 0) {
        return res.status(500).json({
          ok: false,
          message: `Failed to delete some files for order id ${orderId}`,
          failedFiles: failedDeletions
        });
      }

      return res.json({ ok: true, orderId });
    } catch (error) {
      logger.error(`DELETE /orders/:orderId failed: ${error.stack || error.message || error}`);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

// GET /orders/:orderId/video/:filename/duration - admin only: get video duration
router.get("/:orderId/video/:filename/duration", requireAdminAuth, async (req, res) => {
  try {
    const { orderId, filename } = req.params;
    const duration = await getVideoDurationService(orderId, filename);
    return res.json({ ok: true, duration });
  } catch (err) {
    logger.error(`GET /orders/:orderId/video/:filename/duration failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

// POST /orders/:orderId/video/:filename/thumbnail - admin only: extract thumbnail at specific time
router.post("/:orderId/video/:filename/thumbnail", requireAdminAuth, async (req, res) => {
  try {
    const { orderId, filename } = req.params;
    const { timeInSeconds } = req.body; // Time in seconds (default: 1)

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const thumbnailResult = await extractThumbnailService(orderId, filename, timeInSeconds);

    // Update the video file in the order with the new thumbnail
    const mediaIndex = order.media.findIndex(m => m.filename === filename);
    if (mediaIndex !== -1) {
      // Delete old thumbnail if exists
      if (order.media[mediaIndex].thumbnailFilename) {
        const oldFilename = order.media[mediaIndex].thumbnailFilename;
        try {
          await uploadService.deleteFile(orderId, oldFilename);
          logger.info(`Deleted old thumbnail ${oldFilename} from B2 for order ${orderId}`);
        } catch (err) {
          logger.warn(`Failed to delete old thumbnail ${oldFilename} from B2: ${err.message}`);
        }
      }

      order.media[mediaIndex].thumbnail = thumbnailResult.thumbnailUrl;
      order.media[mediaIndex].thumbnailFilename = thumbnailResult.thumbnailFilename;
      await order.save();
    }

    logger.info(`Thumbnail extracted and set for video ${filename} in order ${orderId}`);

    const cdnUrl = Credentials.OFFICIAL_CDN_URL;
    const bucketName = Credentials.B2_BUCKET_NAME;
    const signedThumbnail = `${cdnUrl}/file/${bucketName}/orders/${orderId}/${encodeURIComponent(thumbnailResult.thumbnailFilename)}`;

    return res.json({
      ok: true,
      thumbnail: signedThumbnail,
      thumbnailFilename: thumbnailResult.thumbnailFilename
    });
  } catch (err) {
    logger.error(`POST /orders/:orderId/video/:filename/thumbnail failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

// PUT /orders/:orderId/background-image - admin only: set background image from order's media
router.put("/:orderId/background-image", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { filename } = req.body;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    if (!filename) {
      return res.status(400).json({ ok: false, message: "filename is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaItem = order.media.find(item => item.filename === filename);
    if (!mediaItem) {
      logger.warn(`Filename "${filename}" not found in media for order ${orderId}`);
      return res.status(404).json({ ok: false, message: "Media file not found in this order" });
    }

    // Update the order's background image
    order.orderBackground.image = mediaItem.url;
    order.orderBackground.filename = filename;
    await order.save();

    const cdnUrl = Credentials.OFFICIAL_CDN_URL;
    const bucketName = Credentials.B2_BUCKET_NAME;
    const signedBackground = `${cdnUrl}/file/${bucketName}/orders/${orderId}/${encodeURIComponent(filename)}`;

    logger.info(`Background image set for order ${orderId}: ${filename}`);
    return res.json({
      ok: true,
      orderBackground: {
        ...order.orderBackground,
        image: signedBackground
      }
    });
  } catch (err) {
    logger.error(`PUT /orders/:orderId/background-image failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

// DELETE /orders/:orderId/background-image - admin only: clear the order's background image reference
router.delete("/:orderId/background-image", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Clear the background reference
    order.orderBackground.image = null;
    order.orderBackground.filename = null;
    await order.save();

    logger.info(`Background image cleared for order ${orderId}`);
    return res.json({
      ok: true,
      message: "Background image cleared successfully",
      orderBackground: order.orderBackground
    });
  } catch (err) {
    logger.error(`DELETE /orders/:orderId/background-image failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

// GET /orders/:orderId/download/:filename - public (with obfuscated orderId) or authenticated download
router.get("/:orderId/download/:filename", async (req, res) => {
  try {
    const { orderId, filename } = req.params;

    // Construct the B2 key
    const key = `orders/${orderId}/${filename}`;

    logger.info(`Download requested for: ${key}`);

    const startTime = Date.now();
    // Get file from B2
    const fileBuffer = await b2.downloadFileByName(key);

    logger.info(`Downloaded ${key} in ${Date.now() - startTime}ms`);
    // Set appropriate headers
    res.type(filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(fileBuffer);
  } catch (err) {
    logger.error(`Download failed for ${req.params.filename}: ${err.message}`);
    return res.status(500).json({ ok: false, message: "Download failed" });
  }
});

// POST /orders/:orderId/download-selected - download multiple selected files as zip
router.post("/:orderId/download-selected", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { filenames } = req.body;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    if (!filenames || !Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ ok: false, message: "filenames array is required" });
    }

    // Get the order to validate files
    const order = await Order.findById(orderId).lean();
    if (!order) {
      logger.warn(`Order not found for batch download: ${orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Validate all filenames exist in the order
    const orderFilenames = order.media ? order.media.map(m => m.filename) : [];
    const invalidFiles = filenames.filter(f => !orderFilenames.includes(f));

    if (invalidFiles.length > 0) {
      logger.warn(`Invalid files requested for download in order ${orderId}: ${invalidFiles.join(', ')}`);
      return res.status(400).json({
        ok: false,
        message: "Some files do not exist in this order",
        invalidFiles
      });
    }

    // Get media items for the requested files
    const mediaToDownload = order.media.filter(m => filenames.includes(m.filename));

    logger.info(`Starting batch download for order ${orderId} (${mediaToDownload.length} files)`);

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="selected-files.zip"`);

    // Create archiver instance with Zip64 and no compression
    const archive = archiver('zip', {
      zlib: { level: 0 },
      forceZip64: true
    });

    // Pipe archive to response
    archive.pipe(res);

    // Handle archiver errors
    archive.on('error', (err) => {
      logger.error(`Archiver error for batch download in order ${orderId}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Failed to create zip file' });
      }
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        logger.warn(`Archiver warning (ENOENT): ${err.message}`);
      } else {
        logger.error(`Archiver warning: ${err.message}`);
      }
    });

    // Handle client disconnection
    req.on('close', () => {
      logger.info(`Batch download client disconnected for order ${orderId}. Aborting.`);
      archive.abort();
    });

    // Disable timeout
    req.setTimeout(0);

    // Process files sequentially for better stability in production with large files
    for (const media of mediaToDownload) {
      try {
        const key = `orders/${orderId}/${media.filename}`;
        const fileName = media.originalName || media.filename;

        // Get stream from B2
        const fileStream = await b2.downloadFileStream(key);

        // Append to archive and wait for it to finish reading from B2
        await new Promise((resolve, reject) => {
          fileStream.on('end', () => {
            processedFiles++;
            if (processedFiles % 10 === 0 || processedFiles === mediaToDownload.length) {
              logger.info(`Batch streamed file ${processedFiles}/${mediaToDownload.length}: ${fileName}`);
            }
            resolve();
          });

          fileStream.on('error', (err) => {
            logger.error(`Batch stream error for ${fileName}: ${err.message}`);
            resolve(); // Continue with next file
          });

          archive.append(fileStream, { name: fileName });
        });
      } catch (error) {
        logger.error(`Failed to stream file ${media.filename} from B2: ${error.message}`);
      }
    }

    // Finalize the archive
    await archive.finalize();

    logger.info(`Successfully created batch download zip for order ${orderId} (${processedFiles}/${mediaToDownload.length} files)`);

  } catch (err) {
    logger.error(`POST /orders/:orderId/download-selected failed: ${err.stack || err}`);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error", error: err.message });
    }
  }
});

// POST /orders/:orderId/generate-thumbnails - REMOVED


import orderFolderRoutes from './orderFolders.js';
router.use("/folders", orderFolderRoutes);

import emails from './emails.js';
router.use("/emails", emails);

export default router;
