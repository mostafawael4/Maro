const express = require('express');
const Packages = require('../models/Package');
const { requireAdminAuth } = require("../middleware/auth");
const router = express.Router();

/**
 * ✅ Add or update a package category
 * POST /packages/save
 */
router.post('/save', requireAdminAuth, async (req, res) => {
  try {
    const { packageName, displayName, collections, extras } = req.body;
    if (!packageName || !displayName)
      return res.status(400).json({ error: 'packageName and displayName are required' });

    // Check if category exists
    let existing = await Packages.findOne({ packageName });
    if (existing) {
      existing.displayName = displayName;
      existing.collections = collections;
      existing.extras = extras || [];
      await existing.save();
      return res.status(200).json({ message: 'Package category updated successfully', data: existing });
    }

    const newPackage = await Packages.create({ packageName, displayName, collections, extras });
    res.status(201).json({ message: 'Package category created successfully', data: newPackage });
  } catch (err) {
    console.error('Error saving package:', err);
    res.status(500).json({ error: 'Failed to save package' });
  }
});

/**
 * ✅ Get all package categories
 * GET /packages
 */
router.get('/', async (req, res) => {
  try {
    const all = await Packages.find().lean();
    res.json(all);
  } catch (err) {
    console.error('Error fetching packages:', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

/**
 * ✅ Get a single category by packageName
 * GET /packages/:packageName
 */
router.get('/:packageName', async (req, res) => {
  try {
    const pkg = await Packages.findOne({ packageName: req.params.packageName }).lean();
    if (!pkg) return res.status(404).json({ error: 'Package category not found' });
    res.json(pkg);
  } catch (err) {
    console.error('Error fetching package:', err);
    res.status(500).json({ error: 'Failed to fetch package' });
  }
});

module.exports = router;
