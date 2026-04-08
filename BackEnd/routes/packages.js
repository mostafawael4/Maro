import express from 'express';
import Packages from '../models/Package.js';
import { requireAdminAuth } from "../middleware/auth.js";
const router = express.Router();
import logger from "../utils/logger.js";

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
 * Filter UAE-hidden items from a package when country=AE.
 */
const applyUAEVisibility = (packages, country) => {
  if (!country || country.toUpperCase() !== 'AE') return packages;
  return packages.map(pkg => ({
    ...pkg,
    collections: (pkg.collections || []).filter(c => !c.hiddenInUAE),
    extras: (pkg.extras || []).filter(e => !e.hiddenInUAE),
  }));
};

/**
 * ✅ Get all package categories
 * GET /packages?country=AE  (optional — filters hiddenInUAE items for UAE users)
 */
router.get('/', async (req, res) => {
  logger.info("GET /packages requested");
  try {
    const all = await Packages.find().lean();
    const country = req.query.country || '';
    const filtered = applyUAEVisibility(all, country);
    logger.info(`Fetched ${all.length} package categories (country=${country || 'none'}).`);
    res.json(filtered);
  } catch (err) {
    logger.error('Error fetching packages:', err);
    console.error('Error fetching packages:', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

/**
 * ✅ Get a single category by packageName
 * GET /packages/:packageName?country=AE
 */
router.get('/:packageName', async (req, res) => {
  logger.info(`GET /packages/${req.params.packageName} requested`);
  try {
    const pkg = await Packages.findOne({ packageName: req.params.packageName }).lean();
    if (!pkg) {
      logger.warn(`Package category not found: ${req.params.packageName}`);
      return res.status(404).json({ error: 'Package category not found' });
    }
    const country = req.query.country || '';
    const [filtered] = applyUAEVisibility([pkg], country);
    logger.info(`Fetched package category: ${req.params.packageName}`);
    res.json(filtered);
  } catch (err) {
    logger.error('Error fetching package:', err);
    console.error('Error fetching package:', err);
    res.status(500).json({ error: 'Failed to fetch package' });
  }
});

export default router;
