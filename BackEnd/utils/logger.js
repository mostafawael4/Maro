import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

dotenv.config();

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, align } = format;

const LOG_DIR = process.env.LOG_DIR || './logs';

const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});

const isDevelopment = process.env.NODE_ENV === 'development';

let logger;

if (isDevelopment) {
    logger = createLogger({
        level: 'info',
        silent: !isDevelopment, // Only log in development
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
        ]
    });
}
else {
    logger = {
        info: console.log,
        error: console.error
    };
}


export default logger;