import express from "express";
const router = express.Router();
import Order from "../models/order.js";
import { requireAdminAuth } from "../middleware/auth.js";
import logger from "../utils/logger.js";

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

    // Feedbacks is an array of {feedback}
    order.feedbacks = order.feedbacks || [];
    order.feedbacks.push({ feedback }); 

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
            feedbackText: feedback.feedback,
            feedbackId: feedback._id
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

// DELETE /orders/:orderId/feedbacks/:feedbackId - Delete a specific feedback from an order (admin)
router.delete("/:orderId/:feedbackId", requireAdminAuth, async (req, res) => {
    const { orderId, feedbackId } = req.params;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            logger.warn(`Order not found for deleting feedback: ${orderId}`);
            return res.status(404).json({ ok: false, message: "Order not found" });
        }
        // Find the feedback index
        const feedbackIndex = Array.isArray(order.feedbacks)
            ? order.feedbacks.findIndex(fb => (
                (typeof fb._id === "object" && fb._id.toString() === feedbackId) ||
                (typeof fb === "object" && fb._id && fb._id.toString() === feedbackId) // fallback for nested
            ))
            : -1;

        if (feedbackIndex === -1) {
            logger.warn(`Feedback not found for delete: Order ${orderId}, Feedback ${feedbackId}`);
            return res.status(404).json({ ok: false, message: "Feedback not found" });
        }

        // Remove the feedback
        order.feedbacks.splice(feedbackIndex, 1);
        await order.save();

        logger.info(`Deleted feedback ${feedbackId} from order ${orderId}`);
        return res.json({ ok: true, message: "Feedback deleted successfully." });
    } catch (err) {
        logger.error(`DELETE /orders/${orderId}/feedbacks/${feedbackId} failed: ${err.stack || err}`);
        return res.status(500).json({ ok: false, message: "Server error" });
    }
});

// DELETE /orders/:orderId/feedbacks - Delete all feedbacks from an order (admin)
router.delete("/:orderId", requireAdminAuth, async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      logger.warn(`Order not found for deleting all feedbacks: ${orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Remove all feedbacks
    order.feedbacks = [];
    await order.save();

    logger.info(`Deleted all feedbacks from order ${orderId}`);
    return res.json({ ok: true, message: "All feedbacks deleted successfully." });
  } catch (err) {
    logger.error(`DELETE /orders/${orderId}/feedbacks failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

export default router;