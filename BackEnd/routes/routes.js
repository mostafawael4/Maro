const express = require('express');
const router = express.Router();

const adminRoutes = require('./admin');
const orderRoutes = require('./Orders/orders');
const logsRoutes = require('./logs');
const galleryRoutes = require('./gallery');
const filmsRoutes = require('./films');
const homepage = require("./homePage")
const packagesRoutes = require('./packages');
const orderFeedbacksRoutes = require('./orderFeedbacks');
const feedback = require('./feedback')
const contactUS =  require("./contactUs");

// Mount all sub-routes under /
router.use('/admin', adminRoutes);
router.use('/orders', orderRoutes);
router.use('/logs', logsRoutes);
router.use('/gallery', galleryRoutes);
router.use('/films', filmsRoutes);
router.use('/homepage', homepage);
router.use('/packages', packagesRoutes);
router.use('/feedbacks/orders', orderFeedbacksRoutes);
router.use('/feedbacks', feedback);
router.use("/contact", contactUS);

module.exports = router;
