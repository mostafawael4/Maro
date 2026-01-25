import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import Credentials  from '../config/Credentials.js';

const transporter = nodemailer.createTransport({
  host: Credentials.SMTP_HOST,
  port: Number(Credentials.SMTP_PORT),
  secure: false,
  auth: {
    user: Credentials.SMTP_USER,
    pass: Credentials.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
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

export async function sendMail({ to, subject, text, html }) {
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
    console.log("SMTP connection failed:", err);
    return false;
  }
}