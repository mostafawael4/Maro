const NODE_ENV = process.env.NODE_ENV;

const PORT = process.env.PORT || 4000;
const SERVER_ORIGIN = process.env.SERVER_ORIGIN || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 4000;

const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || '';
const DB_HOST = process.env.DB_HOST || '';
const DB_CLUSTER = process.env.DB_CLUSTER || '';
const MONGO_URI = `mongodb+srv://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?appName=${DB_CLUSTER}`;

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '.';
const UPLOAD_DIR_ORDERS = process.env.UPLOAD_DIR_ORDERS || '.';
const UPLOAD_DIR_GALLERY = process.env.UPLOAD_DIR_GALLERY || '.';
const UPLOAD_DIR_FILMS = process.env.UPLOAD_DIR_GALLERY || '.';

const LOG_DIR = process.env.LOGGING_PATH;

const FFMPEG_PATH = process.env.FFMPEG_PATH;
const FFPROBE_PATH = process.env.FFPROBE_PATH;

const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const FROM_EMAIL = process.env.FROM_EMAIL
const CONTACT_RECEIVER = process.env.CONTACT_RECEIVER

module.exports = {
  NODE_ENV,
  PORT,
  SERVER_ORIGIN,
  FRONTEND_ORIGIN,
  MONGO_URI,
  SESSION_SECRET,
  UPLOAD_DIR,
  UPLOAD_DIR_ORDERS,
  UPLOAD_DIR_GALLERY,
  UPLOAD_DIR_FILMS,
  LOG_DIR,
  FFMPEG_PATH,
  FFPROBE_PATH,
  ADMIN_INITIAL_PASSWORD,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  FROM_EMAIL,
  CONTACT_RECEIVER
};
