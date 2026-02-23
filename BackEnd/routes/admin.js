import express from 'express';
const router = express.Router();
import bcrypt from 'bcryptjs';
import Admin from '../models/admin.js';
import { requireAdminAuth, requireAdminOrEditorAuth } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import Credentials from '../config/Credentials.js';

// POST /admin/setup
// Creates admin and editor users if neither exist.
// Only available if both users are missing/excluded.
router.post('/setup', async (req, res) => {
  try {
    // Check if admin or editor already exist
    const adminExists = await Admin.findOne({ username: 'admin' });
    const editorExists = await Admin.findOne({ username: 'editor' });

    if (adminExists && editorExists) {
      logger.warn('Attempt to create admin and editor when both already exist');
      return res.status(400).json({ ok: false, message: 'Admin and editor already exist' });
    }
    if (adminExists) {
      logger.warn('Attempt to create admin when admin already exists');
      return res.status(400).json({ ok: false, message: 'Admin already exists' });
    }
    if (editorExists) {
      logger.warn('Attempt to create editor when editor already exists');
      return res.status(400).json({ ok: false, message: 'Editor already exists' });
    }

    // Require both admin and editor passwords in the request
    const adminPassword = Credentials.ADMIN_INITIAL_PASSWORD;
    const editorPassword = Credentials.EDITOR_INITIAL_PASSWORD;
    if (!adminPassword || !editorPassword) {
      logger.warn('Setup admin/editor called without both required environment variables');
      return res.status(400).json({ ok: false, message: 'Both ADMIN_INITIAL_PASSWORD and EDITOR_INITIAL_PASSWORD environment variables are required' });
    }

    // Create admin user
    const adminSalt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash(adminPassword, adminSalt);
    const adminUser = await Admin.create({ username: 'admin', passwordHash: adminPasswordHash });

    // Create editor user
    const editorSalt = await bcrypt.genSalt(10);
    const editorPasswordHash = await bcrypt.hash(editorPassword, editorSalt);
    const editorUser = await Admin.create({ username: 'editor', passwordHash: editorPasswordHash });

    logger.info(`Admin and editor created with ids ${adminUser._id}, ${editorUser._id}`);

    return res.json({ ok: true, message: 'Admin and editor created', adminId: adminUser._id, editorId: editorUser._id });
  } catch (err) {
    logger.error('Error in /admin/setup: ' + err);
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      logger.warn('Login attempt without username or password');
      return res.status(400).json({ ok: false, message: 'Username and password required' });
    }

    if (username === 'admin') {
      const admin = await Admin.findOne({ username: 'admin' });
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
      req.session.isEditor = false;
      req.session.adminId = admin._id;

      // Force session save before redirecting to prevent race condition on mobile
      req.session.save(err => {
        if (err) {
          logger.error('Session save error during admin login: ' + err);
          return res.status(500).json({ ok: false, message: 'Server error' });
        }
        logger.info(`Admin logged in (adminId=${admin._id})`);
        return res.json({
          ok: true,
          message: 'Logged in as admin',
          username: 'admin',
          sessionId: req.sessionID
        });
      });

    } else if (username === 'editor') {
      // Find editor user in admins and compare passwords
      const editor = await Admin.findOne({ username: 'editor' });
      if (!editor) {
        logger.warn('Login attempt with nonexistent editor user');
        return res.status(401).json({ ok: false, message: 'Editor not set up' });
      }

      const match = await bcrypt.compare(password, editor.passwordHash);
      if (!match) {
        logger.warn('Invalid editor password login attempt');
        return res.status(401).json({ ok: false, message: 'Invalid password' });
      }

      // set session
      req.session.isAdmin = false;
      req.session.isEditor = true;
      req.session.editorUsername = username;

      // Force session save before redirecting to prevent race condition on mobile
      req.session.save(err => {
        if (err) {
          logger.error('Session save error during editor login: ' + err);
          return res.status(500).json({ ok: false, message: 'Server error' });
        }
        logger.info(`Editor logged in (username=${username})`);
        return res.json({
          ok: true,
          message: 'Logged in as editor',
          username,
          sessionId: req.sessionID
        });
      });

    } else {
      logger.warn(`Login attempt with unknown username: ${username}`);
      return res.status(401).json({ ok: false, message: 'Invalid username' });
    }

  } catch (err) {
    logger.error('Error in /admin/login: ' + err);
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /admin/logout
router.post('/logout', requireAdminOrEditorAuth, (req, res) => {
  const userType = req.session.isAdmin ? 'admin' : req.session.isEditor ? 'editor' : 'unknown';
  const userIdOrUsername = req.session.isAdmin
    ? req.session.adminId || 'unknown'
    : req.session.isEditor
      ? req.session.editorUsername || 'unknown'
      : 'unknown';

  req.session.destroy(err => {
    if (err) {
      logger.error(`Logout failed for ${userType} (${userType === 'admin' ? 'adminId' : 'username'}=${userIdOrUsername}): ${err}`);
      return res.status(500).json({ ok: false, message: 'Logout failed' });
    }
    logger.info(`${userType.charAt(0).toUpperCase() + userType.slice(1)} logged out (${userType === 'admin' ? 'adminId' : 'username'}=${userIdOrUsername})`);

    // Clear cookie with the same settings as when it was created
    res.clearCookie('connect.sid', {
      path: '/',
      secure: Credentials.NODE_ENV === 'production',
      sameSite: Credentials.NODE_ENV === 'production' ? 'none' : 'lax',
      httpOnly: true
    });

    return res.json({ ok: true, message: 'Logged out' });
  });
});

// GET /admin/me  (protected - admin or editor)
router.get('/me', requireAdminOrEditorAuth, (req, res) => {
  let role = 'unknown', usernameOrId = 'unknown';
  if (req.session.isAdmin) {
    role = 'admin';
    usernameOrId = req.session.adminId || 'unknown';
  } else if (req.session.isEditor) {
    role = 'editor';
    usernameOrId = req.session.editorUsername || 'unknown';
  }
  logger.info(`${role} (${usernameOrId}) requested /admin/me`);
  res.json({ ok: true, message: `You are ${role}` });
});

// POST /admin/change-password
router.post('/change-password', requireAdminOrEditorAuth, async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: 'Username, old password, and new password are required' });
    }

    // Find the admin by username
    const admin = await Admin.findOne({ username: username });
    if (!admin) {
      logger.error(`Admin account not found for username "${username}" during password change`);
      return res.status(404).json({ ok: false, message: 'Admin account not found' });
    }

    // Compare old password with current passwordHash
    const isMatch = await bcrypt.compare(oldPassword, admin.passwordHash);
    if (!isMatch) {
      logger.warn(`Admin (${username}) tried to change password with incorrect old password`);
      return res.status(401).json({ ok: false, message: 'Old password is incorrect' });
    }

    // Hash the new password
    const newHash = await bcrypt.hash(newPassword, 10);

    // Update the password
    admin.passwordHash = newHash;
    await admin.save();

    logger.info(`Password changed successfully for admin (${username})`);
    return res.json({ ok: true, message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Error in /admin/change-password: ' + err);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
});



export default router;