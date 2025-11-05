const express = require("express");
const router = express.Router();
const Order = require("../models/order");
const { requireAdminAuth } = require("../middleware/auth");
const uploadService = require("../services/upload.service");
const multer = require("multer");
const allowedExtensions = require("../config/allowed_extensions.json");
const logger = require("../utils/logger");

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
    logger.info(`Listed all orders by ${req.session && req.session.adminId ? req.session.adminId : "unknown admin"}`);
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
    logger.error(`GET /orders/${req.params.orderId} failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// PUT /orders/:orderId/status - admin only: update status
router.put("/:orderId/status", requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "in-progress", "done"].includes(status)) {
      logger.warn(`Invalid status "${status}" set attempt on order ${req.params.orderId}`);
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
    logger.error(`PUT /orders/${req.params.orderId}/status failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// POST /orders/:orderId/upload - admin only upload images/videos to this order

const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [
      ...allowedExtensions,
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image and video files are allowed!"));
  },
});

router.post(
  "/:orderId/upload",
  requireAdminAuth,
  uploadMemory.array("images", 50), // files available on req.files as Buffer
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
        const url = uploadService.saveFile(orderId, f.buffer, f.originalname);
        logger.info(`Saved file "${f.originalname}" for order ${orderId} (URL: ${url})`);
        return {
          filename: url.split("/").pop(),
          url,
          uploadedAt: new Date(),
        };
      });

      order.images.push(...fileObjs);
      await order.save();

      logger.info(`Files added to order ${orderId}: [${fileObjs.map(f => f.filename).join(", ")}]`);
      return res.json({ ok: true, added: fileObjs, order });
    } catch (err) {
      logger.error(`POST /orders/${req.params.orderId}/upload failed: ${err.stack || err}`);
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

// GET /home/recent-random?limit=6 - return random images from recent orders for homepage
router.get("/home/recent-random", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    // strategy:
    // 1. take recent orders (e.g. latest 50)
    // 2. collect all image entries
    // 3. return up to `limit` random images
    const recent = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const images = recent.flatMap((o) =>
      (o.images || []).map((img) => ({ ...img, orderId: o._id }))
    );
    if (images.length === 0) {
      logger.info("Requested homepage recent-random images; none found.");
      return res.json({ ok: true, images: [] });
    }

    // shuffle and pick `limit`
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    const selected = images.slice(0, Math.min(limit, images.length));
    logger.info(`Returned ${selected.length} random images for homepage from ${images.length} candidates`);
    return res.json({ ok: true, images: selected });
  } catch (err) {
    logger.error(`GET /orders/home/recent-random failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
