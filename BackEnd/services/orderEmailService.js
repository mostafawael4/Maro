import { sendMail } from "./emailService.js";
import logger from "../utils/logger.js";
import Credentials from '../config/Credentials.js';

/**
 * Sends a booking confirmation email to the client after they create an order.
 * @param {Object} order - The order document from MongoDB.
 */
export async function sendBookingConfirmationEmail(order) {
    try {
        const brideAndGroom = order.orderForm?.brideAndGroomNames || "N/A";

        await sendMail({
            to: order.email,
            subject: "Booking Confirmation",
            html: `
                <div style="background-color:#f9f6f2; padding:40px 0; font-family:'Segoe UI', Roboto, sans-serif;">
                  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                    <div style="background:#7b2e2f; color:#fff; padding:20px 30px;">
                      <h2 style="margin:0; font-weight:500;">Booking Confirmation</h2>
                      <p style="margin:5px 0 0;">Order ID: ${order._id}</p>
                    </div>
                    <div style="padding:30px;">
                      <p style="margin:0 0 10px;">Dear <strong>${brideAndGroom}</strong>,</p>
                      <div style="margin:20px 0; padding:15px; background:#fdf8f6; border-left:4px solid #7b2e2f; border-radius:5px;">
                        <p style="margin:0; line-height:1.6; color:#444;">
                          We’re pleased to confirm your booking with us. Thank you for choosing us to capture your special day! We’re excited to be part of these moments and can’t wait to create beautiful memories with you.
                        </p>
                      </div>
                      <p style="font-size:13px; color:#999;">This is an automated confirmation of your booking with Maro.</p>
                    </div>
                    <div style="background:#f4f1ef; padding:15px; text-align:center; font-size:13px; color:#666;">
                      <p style="margin:0;">© ${new Date().getFullYear()} Maro</p>
                    </div>
                  </div>
                </div>
            `,
        });
        logger.info(`Booking confirmation email sent for order ID ${order._id} to ${order.email}`);
    } catch (err) {
        logger.error(`Failed to send booking confirmation email for order ${order._id}: ${err.stack || err}`);
    }
}

/**
 * Sends an email to the client when their order is marked as "done".
 * @param {Object} order - The order document.
 */
export async function sendOrderReadyEmail(order) {
    try {
        const brideAndGroom = order.orderForm?.brideAndGroomNames || "N/A";

        await sendMail({
            to: order.email,
            subject: "Your Special Moments are Ready!",
            html: `
                <div style="background-color:#f9f6f2; padding:40px 0; font-family:'Segoe UI', Roboto, sans-serif;">
                  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                    <div style="background:#7b2e2f; color:#fff; padding:20px 30px;">
                      <h2 style="margin:0; font-weight:500;">Event Successfully Completed</h2>
                      <p style="margin:5px 0 0;">Order ID: ${order._id}</p>
                    </div>
                    <div style="padding:30px;">
                      <p style="margin:0 0 10px;"><strong>Brides & Groom:</strong> ${brideAndGroom}</p>
                      <div style="margin:20px 0; padding:15px; background:#fdf8f6; border-left:4px solid #7b2e2f; border-radius:5px;">
                        <p style="margin:0; line-height:1.6; color:#444;">
                          We’re pleased to inform you that your event has been successfully completed.<br><br>
                          We sincerely thank you for choosing us to be part of your special day. It was a true pleasure capturing these moments, and we hope you enjoy the photos as much as we enjoyed creating them!<br><br>
                          You can access your Event <a href="${Credentials.FRONTEND_ORIGIN}/orders" style="color:#7b2e2f; text-decoration:none;">here</a>.
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
        logger.info(`Order readiness email sent for order ID ${order._id} to ${order.email}`);
    } catch (err) {
        logger.error(`Failed to send order readiness email for order ${order._id}: ${err.stack || err}`);
    }
}
