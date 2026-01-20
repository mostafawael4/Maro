import fs from 'fs';
import path from 'path';
import logger from "../utils/logger.js";

/**
 * Delete a file by its given file system path.
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export const deleteFileByPath = (filePath) => {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      logger.warn('Attempted to delete file with no file path provided');
      return reject(new Error('No file path provided'));
    }
    const resolvedPath = path.resolve(filePath);
    fs.unlink(resolvedPath, (err) => {
      if (err) {
        logger.error(`Failed to delete file at ${resolvedPath}: ${err.message}`);
        return reject(err);
      }
      logger.info(`Successfully deleted file at ${resolvedPath}`);
      resolve();
    });
  });
};

/**
 * Delete a folder (and all its contents) by its given file system path.
 * @param {string} folderPath
 * @returns {Promise<void>}
 */
export const deleteFolderByPath = (folderPath) => {
  return new Promise((resolve, reject) => {
    if (!folderPath) {
      logger.warn('Attempted to delete folder with no folder path provided');
      return reject(new Error('No folder path provided'));
    }
    const resolvedPath = path.resolve(folderPath);
    fs.rm(resolvedPath, { recursive: true, force: true }, (err) => {
      if (err) {
        logger.error(`Failed to delete folder at ${resolvedPath}: ${err.message}`);
        return reject(err);
      }
      logger.info(`Successfully deleted folder at ${resolvedPath}`);
      resolve();
    });
  });
};