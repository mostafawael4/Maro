// Only load dotenv in local development (not in Firebase Functions)
// Firebase Functions uses environment variables from Firebase Console
if (!process.env.FUNCTION_TARGET && !process.env.K_SERVICE) {
    try {
      require('dotenv').config();
    } catch (err) {
      // dotenv.config() failed - this is OK if no .env file exists
      // (Firebase Functions doesn't need .env files)
    }
  }
  
  const { createLogger, format, transports } = require('winston');
  const { combine, timestamp, printf, colorize, align } = format;
  const DailyRotateFile = require('winston-daily-rotate-file');
  const path = require('path');
  
  const LOG_DIR = process.env.LOG_DIR || './logs';
  
  const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  });
  
  const logger = createLogger({
    level: 'info',
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss Z' }),
      align(),
      logFormat
    ),
    transports: [
      new transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      }),
      // On Firebase Functions, file logging doesn't work - only console
      // Skip file transports if on Firebase
      ...(process.env.FUNCTION_TARGET || process.env.K_SERVICE
        ? []
        : [
            new DailyRotateFile({
              filename: path.join(LOG_DIR, '%DATE%-combined.log'),
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '14d',
              level: 'info',
            }),
            new DailyRotateFile({
              filename: path.join(LOG_DIR, '%DATE%-error.log'),
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '30d',
              level: 'error',
            }),
          ]),
    ],
  });
  
  module.exports = logger;