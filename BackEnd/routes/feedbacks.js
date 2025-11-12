const express = require("express");
const router = express.Router();
const Order = require("../models/order");

// POST /orders/:orderId/feedback - Add feedback for an order by its id (public)
router.post("/:orderId/feedback", async (req, res) => {
    const { orderId } = req.params;
    const { feedback } = req.body;
  
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }
    if (!feedback || typeof feedback !== "string" || feedback.length === 0) {
      return res.status(400).json({ ok: false, message: "Feedback is required" });
    }
  
    try {
      const order = await Order.findById(orderId);
  
      if (!order) {
        logger.warn(`Order not found for feedback: ${orderId}`);
        return res.status(404).json({ ok: false, message: "Order not found" });
      }
  
      order.feedbacks = order.feedbacks || [];
      order.feedbacks.push(feedback);
      await order.save();
  
      logger.info(`Feedback added for order ${orderId}: ${feedback}`);
      return res.json({ ok: true, feedbacks: order.feedbacks });
    } catch (err) {
      logger.error(`POST /orders/${orderId}/feedback failed: ${err.stack || err}`);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
});
  
// GET /orders/:orderId/feedbacks - Get feedbacks for a given order id (public)
router.get("/:orderId/feedbacks", async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    try {
        const order = await Order.findById(orderId).lean();

        if (!order) {
        logger.warn(`Order not found for getting feedbacks: ${orderId}`);
        return res.status(404).json({ ok: false, message: "Order not found" });
        }

        return res.json({ ok: true, feedbacks: order.feedbacks || [] });
    } catch (err) {
        logger.error(`GET /orders/${orderId}/feedbacks failed: ${err.stack || err}`);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});

// GET /orders/all-feedbacks - Get all feedbacks from all orders (public)
router.get("/all-feedbacks", async (req, res) => {
    try {
        const feedbackCounts = req.query.feedbackCounts ? parseInt(req.query.feedbackCounts, 10) : null;

        const orders = await Order.find({}, { feedbacks: 1, clientName: 1, email: 1 }).lean();

        // Flatten feedbacks with some identifying info
        let allFeedbacks = [];
        for (const order of orders) {
        if (Array.isArray(order.feedbacks) && order.feedbacks.length > 0) {
            order.feedbacks.forEach(feedback => {
            allFeedbacks.push({
                orderId: order._id,
                clientName: order.clientName,
                email: order.email,
                feedback: feedback
            });
            });
        }
        }

        // If feedbackCounts is provided and is a positive integer, limit the results
        if (feedbackCounts && Number.isInteger(feedbackCounts) && feedbackCounts > 0) {
        allFeedbacks = allFeedbacks.slice(0, feedbackCounts);
        }

        return res.json({ ok: true, feedbacks: allFeedbacks });
    } catch (err) {
        logger.error(`GET /orders/all-feedbacks failed: ${err.stack || err}`);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});

module.exports = router;