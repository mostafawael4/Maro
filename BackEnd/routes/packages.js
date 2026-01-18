const express = require('express');
const Packages = require('../models/Package');
const { requireAdminAuth } = require("../middleware/auth");
const router = express.Router();
const logger = require("../utils/logger");

/**
 * ✅ Add or update a package category
 * POST /packages/save
 */
router.post('/save', requireAdminAuth, async (req, res) => {
  logger.info("Incoming POST /packages/save with body:", req.body);
  try {
    const { packageName, displayName, collections, extras } = req.body;
    if (!packageName || !displayName) {
      logger.warn("packageName or displayName missing in POST /packages/save");
      return res.status(400).json({ error: 'packageName and displayName are required' });
    }

    // Check if category exists
    let existing = await Packages.findOne({ packageName });
    if (existing) {
      logger.info(`Updating existing package category: ${packageName}`);
      existing.displayName = displayName;
      existing.collections = collections;
      existing.extras = extras || [];
      await existing.save();
      logger.info(`Package category updated: ${packageName}`);
      return res.status(200).json({ message: 'Package category updated successfully', data: existing });
    }

    logger.info(`Creating new package category: ${packageName}`);
    const newPackage = await Packages.create({ packageName, displayName, collections, extras });
    logger.info(`Package category created: ${packageName}`);
    res.status(201).json({ message: 'Package category created successfully', data: newPackage });
  } catch (err) {
    logger.error('Error saving package:', err);
    console.error('Error saving package:', err);
    res.status(500).json({ error: 'Failed to save package' });
  }
});

/**
 * ✅ Get all package categories
 * GET /packages
 */
router.get('/', async (req, res) => {
  logger.info("GET /packages requested");
  try {
    const all = await Packages.find().lean();
    logger.info(`Fetched ${all.length} package categories.`);
    res.json(all);
  } catch (err) {
    logger.error('Error fetching packages:', err);
    console.error('Error fetching packages:', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

/**
 * ✅ Get a single category by packageName
 * GET /packages/:packageName
 */
router.get('/:packageName', async (req, res) => {
  logger.info(`GET /packages/${req.params.packageName} requested`);
  try {
    const pkg = await Packages.findOne({ packageName: req.params.packageName }).lean();
    if (!pkg) {
      logger.warn(`Package category not found: ${req.params.packageName}`);
      return res.status(404).json({ error: 'Package category not found' });
    }
    logger.info(`Fetched package category: ${req.params.packageName}`);
    res.json(pkg);
  } catch (err) {
    logger.error('Error fetching package:', err);
    console.error('Error fetching package:', err);
    res.status(500).json({ error: 'Failed to fetch package' });
  }
});

module.exports = router;
