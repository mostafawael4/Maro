import express from "express";
const router = express.Router();
import { sendMail } from "../../services/emailService.js";
import logger from "../../utils/logger.js";
import { requireAdminAuth } from "../../middleware/auth.js";
import Order from "../../models/order.js";
import Credentials  from '../../config/Credentials.js';

router.post("/:orderId", requireAdminAuth, async (req, res) =>{
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

        // Send the email
        await sendMail({
            to: order.email,
            subject: "Your Order is Complete!",
            html: `
                <div style="background-color:#f9f6f2; padding:40px 0; font-family:'Segoe UI', Roboto, sans-serif;">
                  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                    <div style="background:#7b2e2f; color:#fff; padding:20px 30px;">
                      <h2 style="margin:0; font-weight:500;">Your Order is Done!</h2>
                      <p style="margin:5px 0 0;">Order ID: ${order._id}</p>
                    </div>
                    <div style="padding:30px;">
                      <p style="margin:0 0 10px;"><strong>Client Name:</strong> ${order.clientName || "Client"}</p>
                      <div style="margin:20px 0; padding:15px; background:#fdf8f6; border-left:4px solid #7b2e2f; border-radius:5px;">
                        <p style="margin:0; line-height:1.6; color:#444;">
                          Your order is complete!<br>
                          Thank you for choosing us.<br>
                          You can access your order <a href="${Credentials.FRONTEND_ORIGIN}/orders" style="color:#7b2e2f; text-decoration:none;">here</a>.
                        </p>
                      </div>
                      <p style="font-size:13px; color:#999;">This is a notification that your order with Maro is ready.</p>
                    </div>
                    <div style="background:#f4f1ef; padding:15px; text-align:center; font-size:13px; color:#666;">
                      <p style="margin:0;">© ${new Date().getFullYear()} Maro</p>
                    </div>
                  </div>
                </div>
            `,
        });

        logger.info(`Order completion email sent for order ID ${orderId} to ${order.email}`);
        return res.json({ ok: true, message: "Order completion email sent" });
    } catch (err) {
        logger.error(`Error in /emails/orderId: ${err.stack || err}`);
        return res.status(500).json({ ok: false, message: "Failed to send order completion email" });
    }
})

export default router;