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

module.exports = {
  PORT,
  MONGO_URI,
  SESSION_SECRET,
  UPLOAD_DIR,
  LOG_DIR,
  ADMIN_INITIAL_PASSWORD
};
