const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const Credentials  = require('../config/Credentials.js');

const transporter = nodemailer.createTransport({
  host: Credentials.SMTP_HOST,
  port: Credentials.SMTP_PORT,
  secure: false, // true for 465, false for 587
  auth: {
    user: Credentials.SMTP_USER,
    pass: Credentials.SMTP_PASS,
  },
});

// Verify connection
transporter.verify((error, success) => {
  if (error) {
    logger.error("SMTP connection failed:", error);
  } else {
    logger.info("SMTP server ready to send messages");
  }
});

async function sendMail({ to, subject, text, html }) {
  logger.info(
    `Attempting to send email`,
    {
      to,
      subject
    }
  );
  try {
    const info = await transporter.sendMail({
      from: Credentials.FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    logger.info(`Email sent successfully`, {
      messageId: info.messageId,
      to,
      subject
    });
    return info;
  } catch (err) {
    logger.error("Error sending email", {
      error: err,
      to,
      subject
    });
    throw err;
  }
}

module.exports = { sendMail };