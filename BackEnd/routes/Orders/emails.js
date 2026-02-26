import express from "express";
const router = express.Router();
import { sendOrderReadyEmail } from "../../services/orderEmailService.js";
import logger from "../../utils/logger.js";
import { requireAdminAuth } from "../../middleware/auth.js";
import Order from "../../models/order.js";
import Credentials from '../../config/Credentials.js';

router.post("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      logger.warn("No orderId provided in request body");
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Get the order
    const order = await Order.findById(orderId).lean();
    if (!order) {
      logger.warn(`Order with ID ${orderId} not found`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Check if status is 'done'
    if (!order.status || order.status !== "done") {
      logger.warn(`Order ${orderId} is not done, current status: ${order.status}`);
      return res.status(400).json({ ok: false, message: "Order is not marked as done" });
    }

    if (!order.email) {
      logger.warn(`Order ${orderId} has no email specified`);
      return res.status(400).json({ ok: false, message: "Order has no email address" });
    }

    // Send the email using the new centralized service
    await sendOrderReadyEmail(order);


    logger.info(`Order completion email sent for order ID ${orderId} to ${order.email}`);
    return res.json({ ok: true, message: "Order completion email sent" });
  } catch (err) {
    logger.error(`Error in /emails/orderId: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Failed to send order completion email" });
  }
})

export default router;