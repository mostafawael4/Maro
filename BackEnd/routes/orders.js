const express = require("express");
const router = express.Router();
const Order = require("../models/order");
const { requireAdminAuth } = require("../middleware/auth");
const uploadService = require("../services/upload.service");
const multer = require("multer");
const allowedExtensions = require("../config/allowed_extensions.json");
const logger = require("../utils/logger");
const { handleMulterErrors } = require("../middleware/upload").default;
const { getOrderFilesPaths, deleteOrderfolder, deleteOrderFileByFileName } = require("../services/order.service")

// POST /orders - create a new order (public)
router.post("/", async (req, res) => {
  try {
    const { email, clientName, notes } = req.body;
    if (!email) {
      logger.warn("Attempt to create order without email", { body: req.body });
      return res.status(400).json({ ok: false, message: "Email required" });
    }

    // create an order; you may want to check duplicates or generate a separate order code
    const order = await Order.create({ email, clientName, notes });
    logger.info(`Order created: ${order._id} for email ${email}`);
    return res.json({ ok: true, order });
  } catch (err) {
    logger.error(`POST /orders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /orders - admin only: list all orders
router.get("/", requireAdminAuth, async (req, res) => {
  try {
    const list = await Order.find({}).sort({ createdAt: -1 }).lean();
    logger.info(
      `Listed all orders by ${
        req.session && req.session.adminId
          ? req.session.adminId
          : "unknown admin"
      }`
    );
    return res.json({ ok: true, orders: list });
  } catch (err) {
    logger.error(`GET /orders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /orders/:orderId - admin only: fetch specific order
router.get("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      logger.warn(`Order not found: ${req.params.orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }
    logger.info(`Order fetched: ${req.params.orderId}`);
    return res.json({ ok: true, order });
  } catch (err) {
    logger.error(
      `GET /orders/${req.params.orderId} failed: ${err.stack || err}`
    );
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

// POST /orders/:orderId/upload - admin only upload images/videos to this order

const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [...allowedExtensions.images, ...allowedExtensions.videos];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image and video files are allowed!"));
  },
}).array("media", 50);

router.post(
  "/:orderId/upload",
  requireAdminAuth,
  uploadMemory, // Apply Multer middleware
  handleMulterErrors, // Handle Multer errors
  async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const order = await Order.findById(orderId);
      if (!order) {
        logger.warn(`Upload attempted to non-existent order ${orderId}`);
        return res.status(404).json({ ok: false, message: "Order not found" });
      }

      const files = req.files || [];
      if (!files.length) {
        logger.warn(`Upload attempt to order ${orderId} with no files`);
      } else {
        logger.info(`Uploading ${files.length} files to order ${orderId}`);
      }

      // Save each file using the uploadService
      const fileObjs = files.map((f) => {
        const url = uploadService.saveFile(orderId, f.buffer, f.originalname, {
          isGallery: false,
          isFilm: false,
        });
        logger.info(
          `Saved file "${f.originalname}" for order ${orderId} (URL: ${url})`
        );
        return {
          filename: url.split("/").pop(),
          url,
          uploadedAt: new Date(),
        };
      });

      order.media.push(...fileObjs);
      await order.save();

      logger.info(
        `Files added to order ${orderId}: [${fileObjs
          .map((f) => f.filename)
          .join(", ")}]`
      );
      return res.json({ ok: true, added: fileObjs, order });
    } catch (err) {
      logger.error(
        `POST /orders/${req.params.orderId}/upload failed: ${err.stack || err}`
      );
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

// GET /order/view?email=...  (public) - returns order images if email found
router.get("/view/by-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      logger.warn("Order view by email attempted without providing email.");
      return res.status(400).json({ ok: false, message: "Email required" });
    }

    // find orders by email. If multiple, you may decide how to handle; here we return most recent
    const order = await Order.findOne({ email }).sort({ createdAt: -1 }).lean();
    if (!order) {
      logger.warn(`Order view attempted for non-existent email: ${email}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }
    logger.info(`Order viewed for email: ${email} (order id: ${order._id})`);
    return res.json({ ok: true, order });
  } catch (err) {
    logger.error(`GET /orders/view/by-email failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// GET /orders/by-email?email=... (admin only) - returns ALL orders for a given email
router.get("/view/orders-by-email", requireAdminAuth,
  async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ ok: false, message: "Email required" });
      }
      const orders = await Order.find({ email }).sort({ createdAt: -1 }).lean();
      if (!orders || orders.length === 0) {
        return res.status(404).json({ ok: false, message: "No orders found for email" });
      }
      logger.info(`Admin fetched ${orders.length} order(s) by email: ${email}`);
      return res.json({ ok: true, orders });
    } catch (err) {
      logger.error(`GET /orders/by-email failed: ${err.stack || err}`);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

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
        await deleteOrderfolder(orderId);
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
      if (filenames.length <= 0){
        return res.status(400).json({ ok: false, message: "filenames array is required" });
      }

      // use getOrderFilesPaths to get all files for the order
      let filePaths;
      try {
        filePaths = await getOrderFilesPaths(orderId);
      } catch (error) {
        logger.error(`Error getting order file paths for orderId ${orderId}: ${error.stack || error.message || error}`);
        return res.status(500).json({ ok: false, message: "Failed to fetch order file paths", error: error.message || error });
      }

      // Validate that all filenames in the array exist in the order's files
      const missingFiles = filenames.filter(filename => !filePaths.includes(filename));
      if (missingFiles.length > 0) {
        logger.error(`Files not found for orderId ${orderId}: ${missingFiles.join(", ")}`);
        return res.status(400).json({ ok: false, message: `Files do not exist for order id ${orderId}: ${missingFiles.join(", ")}`});
      }

      // Attempt to delete each requested file, collect failed deletions
      const failedDeletions = [];
      for (const filename of filenames) {
        try {
          await deleteOrderFileByFileName(orderId, filename);
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

module.exports = router;
