const express = require('express');
const router = express.Router();

const adminRoutes = require('./admin');
const orderRoutes = require('./Orders/orders');
const logsRoutes = require('./logs');
const galleryRoutes = require('./gallery');
const filmsRoutes = require('./films');
const homepage = require("./homePage")
const packagesRoutes = require('./packages');
const feedbacksRoutes = require('./feedbacks');
const contactUS =  require("./contactUs");

// Mount all sub-routes under /
router.use('/admin', adminRoutes);
router.use('/orders', orderRoutes);
router.use('/logs', logsRoutes);
router.use('/gallery', galleryRoutes);
router.use('/films', filmsRoutes);
router.use('/homepage', homepage);
router.use('/packages', packagesRoutes);
router.use('/feedbacks', feedbacksRoutes);
router.use("/contact", contactUS);

module.exports = router;
