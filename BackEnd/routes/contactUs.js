const express = require("express");
const router = express.Router();
const { sendMail } = require("../services/emailService.js");
const Credentials  = require('../config/Credentials.js');
const logger = require("../utils/logger.js");

router.post("/", async (req, res) => {
  // Log incoming POST request to the contact form route
  logger.info(`Received POST /contactUs with body: ${JSON.stringify(req.body)}`);

  try {
    // Destructure form fields from the request body
    const { clientName, email, phoneNumber, message } = req.body;

    // Validate that all required fields are provided
    if (!clientName || !email || !message || !phoneNumber) {
      logger.warn("Validation failed: Missing clientName, email, phoneNumber, or message.");
      return res
        .status(400)
        .json({ ok: false, message: "clientName, email, phoneNumber, and message are required." });
    }

    // Log info before attempting to send email
    logger.info(`Attempting to send contact email from "${clientName}" <${email}>`);

    // Send the email to the configured receiver using emailService
    await sendMail({
      to: Credentials.CONTACT_RECEIVER,
      subject: `New message from ${clientName}`,
      html: `
            <div style="background-color:#f9f6f2; padding:40px 0; font-family:'Segoe UI', Roboto, sans-serif;">
              <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.08);">
                <div style="background:#7b2e2f; color:#fff; padding:20px 30px;">
                  <h2 style="margin:0; font-weight:500;">New Contact Message</h2>
                  <p style="margin:5px 0 0;">from ${clientName}</p>
                </div>
                <div style="padding:30px;">
                  <p style="margin:0 0 10px;"><strong>Client Name:</strong> ${clientName}</p>
                  <p style="margin:0 0 10px;"><strong>Client's Phone Number:</strong> ${phoneNumber}</p>
                  <p style="margin:0 0 10px;"><strong>Email:</strong> <a href="mailto:${email}" style="color:#7b2e2f; text-decoration:none;">${email}</a></p>
                  <div style="margin:20px 0; padding:15px; background:#fdf8f6; border-left:4px solid #7b2e2f; border-radius:5px;">
                    <p style="margin:0; line-height:1.6; color:#444;">${message}</p>
                  </div>
                  <p style="font-size:13px; color:#999;">This message was sent via the website’s Contact Form.</p>
                </div>
                <div style="background:#f4f1ef; padding:15px; text-align:center; font-size:13px; color:#666;">
                  <p style="margin:0;">© ${new Date().getFullYear()} Gaby’s Customization</p>
                </div>
              </div>
            </div>
      `,
    });

    // Log successful send
    logger.info("Contact form email sent successfully.");

    // Respond to the client indicating success
    res.json({ ok: true, message: "Message sent successfully." });
  } catch (err) {
    // Log any error encountered during the process
    logger.error(`Error sending contact form: ${err.stack || err}`);
    res.status(500).json({ ok: false, message: "Failed to send message." });
  }
});

module.exports = router;
