const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Admin = require('../models/admin');
const { requireAdminAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// POST /admin/setup
// Creates initial admin if none exists. Use only once or protect it.
router.post('/setup', async (req, res) => {
  try {
    const existing = await Admin.findOne({});
    if (existing) {
      logger.warn('Attempt to create admin when one already exists');
      return res.status(400).json({ ok: false, message: 'Admin already exists' });
    }

    const { username = 'admin', password } = req.body;
    if (!password) {
      logger.warn('Setup admin called without password');
      return res.status(400).json({ ok: false, message: 'Password required' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await Admin.create({ username, passwordHash });
    logger.info(`Admin created with id ${admin._id}`);
    return res.json({ ok: true, message: 'Admin created', adminId: admin._id });
  } catch (err) {
    logger.error('Error in /admin/setup: ' + err);
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      logger.warn('Login attempt without password');
      return res.status(400).json({ ok: false, message: 'Password required' });
    }

    const admin = await Admin.findOne({});
    if (!admin) {
      logger.warn('Login attempt when admin is not set up');
      return res.status(401).json({ ok: false, message: 'Admin not set up' });
    }

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      logger.warn('Invalid admin login attempt');
      return res.status(401).json({ ok: false, message: 'Invalid password' });
    }

    // set session
    req.session.isAdmin = true;
    req.session.adminId = admin._id;

    logger.info(`Admin logged in (adminId=${admin._id})`);
    return res.json({ ok: true, message: 'Logged in' });
  } catch (err) {
    logger.error('Error in /admin/login: ' + err);
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/logout
router.post('/logout', requireAdminAuth, (req, res) => {
  const adminId = req.session.adminId || 'unknown';
  req.session.destroy(err => {
    if (err) {
      logger.error(`Logout failed for adminId=${adminId}: ${err}`);
      return res.status(500).json({ ok:false, message: 'Logout failed' });
    }
    logger.info(`Admin logged out (adminId=${adminId})`);
    res.clearCookie('connect.sid');
    return res.json({ ok: true, message: 'Logged out' });
  });
});

// GET /admin/me  (protected)
router.get('/me', requireAdminAuth, (req, res) => {
  logger.info(`adminId=${req.session.adminId} requested /admin/me`);
  res.json({ ok: true, message: 'You are admin' });
});

module.exports = router;