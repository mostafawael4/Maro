import express from 'express';
const router = express.Router();

import adminRoutes from './admin.js';
import orderRoutes from './Orders/orders.js';
// const logsRoutes = require('./logs');
import galleryRoutes from './gallery.js';
import filmsRoutes from './films.js';
import homepage from "./homePage.js"
import packagesRoutes from './packages.js';
import orderFeedbacksRoutes from './orderFeedbacks.js';
import feedback from './feedback.js'
import contactUS from "./contactUs.js";
import calendarRoutes from './calendar.js';

// Mount all sub-routes under /
router.use('/admin', adminRoutes);
router.use('/orders', orderRoutes);
// router.use('/logs', logsRoutes);
router.use('/gallery', galleryRoutes);
router.use('/films', filmsRoutes);
router.use('/homepage', homepage);
router.use('/packages', packagesRoutes);
router.use('/feedbacks/orders', orderFeedbacksRoutes);
router.use('/feedbacks', feedback);
router.use("/contact", contactUS);
router.use('/calendar', calendarRoutes);

export default router;
