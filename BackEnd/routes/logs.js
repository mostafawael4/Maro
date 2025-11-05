const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const router = express.Router();

require('dotenv').config();

// Middleware (replace with your actual admin auth)
const { requireAdminAuth } = require('../middleware/auth');

// 📁 Logs folder
const logsDir = process.env.LOG_DIR || './logs';

// GET /api/admin/logs?date=YYYY-MM-DD&level=combined|error
router.get('/logs', requireAdminAuth, async (req, res) => {
  try {
    const { date, level } = req.query;

    // Default to today's combined log
    const logDate = date || new Date().toISOString().slice(0, 10);
    const logLevel = level === 'error' ? 'error' : 'combined';

    const filePath = path.join(logsDir, `${logDate}-${logLevel}.log`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }

    // Read last 200 lines for performance
    const data = fs.readFileSync(filePath, 'utf-8');
    const lines = data.trim().split('\n');
    const lastLines = lines.slice(-200); // adjust as needed

    res.json({
      date: logDate,
      level: logLevel,
      entries: lastLines,
    });
  } catch (err) {
    logger.error('Error reading log file:', err);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;
