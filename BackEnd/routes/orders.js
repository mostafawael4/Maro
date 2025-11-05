const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Order = require('../models/order');
const { requireAdminAuth } = require('../middleware/auth');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// ensure upload dir exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer disk storage: store in uploads/{orderId}/
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const orderId = req.params.orderId || 'misc';
    const dir = path.join(UPLOAD_DIR, orderId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // keep original name but prefix with timestamp for uniqueness
    const ts = Date.now();
    const clean = file.originalname.replace(/\s+/g, '_');
    cb(null, `${ts}_${clean}`);
  }
});
const upload = multer({ storage });

// POST /orders - create a new order (public)
router.post('/', async (req, res) => {
  try {
    const { email, clientName, notes } = req.body;
    if (!email) return res.status(400).json({ ok:false, message: 'Email required' });

    // create an order; you may want to check duplicates or generate a separate order code
    const order = await Order.create({ email, clientName, notes });
    return res.json({ ok:true, order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /orders - admin only: list all orders
router.get('/', requireAdminAuth, async (req, res) => {
  try {
    const list = await Order.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ ok:true, orders: list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /orders/:orderId - admin only: fetch specific order
router.get('/:orderId', requireAdminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ ok:false, message: 'Order not found' });
    return res.json({ ok:true, order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// PUT /orders/:orderId/status - admin only: update status
router.put('/:orderId/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','in-progress','done'].includes(status)) {
      return res.status(400).json({ ok:false, message: 'Invalid status' });
    }
    const updated = await Order.findByIdAndUpdate(req.params.orderId, { status }, { new: true });
    return res.json({ ok:true, order: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// POST /orders/:orderId/upload - admin only upload images to this order
router.post('/:orderId/upload', requireAdminAuth, upload.array('images', 50), async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId });
    if (!order) return res.status(404).json({ ok:false, message: 'Order not found' });

    const files = req.files || [];
    const fileObjs = files.map(f => ({
      filename: f.filename,
      url: `/uploads/${order._id}/${f.filename}`,
      uploadedAt: new Date()
    }));

    order.images.push(...fileObjs);
    await order.save();

    return res.json({ ok:true, added: fileObjs, order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /order/view?email=...  (public) - returns order images if email found
router.get('/view/by-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ ok:false, message: 'Email required' });

    // find orders by email. If multiple, you may decide how to handle; here we return most recent
    const order = await Order.findOne({ email }).sort({ createdAt: -1 }).lean();
    if (!order) return res.status(404).json({ ok:false, message: 'Order not found' });

    return res.json({ ok:true, order });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

// GET /home/recent-random?limit=6 - return random images from recent orders for homepage
router.get('/home/recent-random', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    // strategy:
    // 1. take recent orders (e.g. latest 50)
    // 2. collect all image entries
    // 3. return up to `limit` random images
    const recent = await Order.find({}).sort({ createdAt: -1 }).limit(50).lean();
    const images = recent.flatMap(o => (o.images || []).map(img => ({ ...img, orderId: o._id })));
    if (images.length === 0) return res.json({ ok:true, images: [] });

    // shuffle and pick `limit`
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    const selected = images.slice(0, Math.min(limit, images.length));
    return res.json({ ok:true, images: selected });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok:false, message: 'Server error' });
  }
});

module.exports = router;