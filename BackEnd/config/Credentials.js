const PORT = process.env.PORT || 4000;

const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || '';
const DB_HOST = process.env.DB_HOST || '';
const DB_CLUSTER = process.env.DB_CLUSTER || '';
const MONGO_URI = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?appName=${DB_CLUSTER}`;

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '.';

const LOG_DIR = process.env.LOGGING_PATH;

const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const FROM_EMAIL = process.env.FROM_EMAIL
const CONTACT_RECEIVER = process.env.CONTACT_RECEIVER

module.exports = {
  PORT,
  MONGO_URI,
  SESSION_SECRET,
  UPLOAD_DIR,
  LOG_DIR,
  ADMIN_INITIAL_PASSWORD,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
  CONTACT_RECEIVER
};
