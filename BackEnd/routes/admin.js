const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Admin = require('../models/admin');
const { requireAdminAuth } = require('../middleware/auth');

// POST /admin/setup
// Creates initial admin if none exists. Use only once or protect it.
router.post('/setup', async (req, res) => {
  try {
    const existing = await Admin.findOne({});
    if (existing) return res.status(400).json({ ok: false, message: 'Admin already exists' });

    const { username = 'admin', password } = req.body;
    if (!password) return res.status(400).json({ ok: false, message: 'Password required' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await Admin.create({ username, passwordHash });
    return res.json({ ok: true, message: 'Admin created', adminId: admin._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, message: 'Password required' });

    const admin = await Admin.findOne({});
    if (!admin) return res.status(401).json({ ok: false, message: 'Admin not set up' });

    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) return res.status(401).json({ ok: false, message: 'Invalid password' });

    // set session
    req.session.isAdmin = true;
    req.session.adminId = admin._id;

    return res.json({ ok: true, message: 'Logged in' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/logout
router.post('/logout', requireAdminAuth, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ ok:false, message: 'Logout failed' });
    res.clearCookie('connect.sid');
    return res.json({ ok: true, message: 'Logged out' });
  });
});

// GET /admin/me  (protected)
router.get('/me', requireAdminAuth, (req, res) => {
  res.json({ ok: true, message: 'You are admin' });
});

module.exports = router;