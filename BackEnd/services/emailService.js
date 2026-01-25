import { Resend } from 'resend';
import logger from '../utils/logger.js';
import Credentials from '../config/Credentials.js';

const resend = new Resend(Credentials.RESEND_API_KEY);

export async function sendMail({ to, subject, text, html }) {
  logger.info(
    `Attempting to send email via Resend`,
    {
      to,
      subject
    }
  );

  try {
    const data = await resend.emails.send({
      from: Credentials.FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });

    if (data.error) {
      logger.error("Error sending email via Resend", {
        error: data.error,
        to,
        subject
      });
      console.log("Resend connection failed:", data.error);   
      return false;
    }

    logger.info(`Email sent successfully via Resend`, {
      id: data.data.id,
      to,
      subject
    });
    return data;
  } catch (err) {
    logger.error("Exception sending email via Resend", {
      error: err,
      to,
      subject
    });
    console.log("Resend connection failed:", err);
    return false;
  }
}
