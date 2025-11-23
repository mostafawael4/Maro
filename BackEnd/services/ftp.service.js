const ftp = require("basic-ftp");
const logger = require("../utils/logger");
const { Readable } = require("stream");
const { Transform } = require("stream");
const Credentials = require("../config/Credentials");

const timeout = 1800000;

// Store upload progress (in-memory, for production consider Redis)
const uploadProgress = new Map(); // Map<uploadId, {loaded, total, percentage, speed, elapsed, status}>

class FTPService {
  constructor() {
    // Don't create client here - create it per operation
    this.config = {
      host: Credentials.FTP_HOST,
      user: Credentials.FTP_USER,
      password: Credentials.FTP_PASSWORD,
      port: Credentials.FTP_PORT || 21,
      secure: Credentials.FTP_SECURE === "true", // true for FTPS
    };
    // Get base path and normalize it - remove leading/trailing slashes
    this.basePath = (Credentials.FTP_BASE_PATH || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "") // Remove leading slashes
      .replace(/\/+$/, ""); // Remove trailing slashes
    // Get timeout from config (in milliseconds)
    this.timeout = parseInt(Credentials.FTP_TIMEOUT) || 1800000;
  }

  /**
   * Get upload progress by ID
   * @param {string} uploadId - Upload ID
   * @returns {Object|null} Progress object
   */
  getProgress(uploadId) {
    return uploadProgress.get(uploadId) || null;
  }

  /**
   * Clear upload progress after completion
   * @param {string} uploadId - Upload ID
   */
  clearProgress(uploadId) {
    uploadProgress.delete(uploadId);
  }

  /**
   * Prepends base path to remote path if base path is configured
   * @param {string} remotePath - Remote file path
   * @param {boolean} alreadyHasBasePath - If true, don't add base path again
   * @returns {string} Full remote path with base path
   */
  getFullPath(remotePath, alreadyHasBasePath = false) {
    // Normalize remote path - remove leading slashes
    let normalizedPath = remotePath.replace(/\\/g, "/").replace(/^\/+/, "");

    // If base path is set and not already included, prepend it
    if (this.basePath && !alreadyHasBasePath) {
      // Combine base path and normalized path
      return `/${this.basePath}/${normalizedPath}`;
    }

    // If base path already included or no base path, just normalize and add leading slash
    return `/${normalizedPath}`;
  }

  /**
   * Upload a file buffer to FTP server with progress tracking
   * @param {Buffer} buffer - File buffer
   * @param {string} remotePath - Remote file path
   * @param {string} uploadId - Unique upload ID for progress tracking
   * @returns {Promise<string>} - URL path to access the file
   */
  async uploadFile(buffer, remotePath, uploadId = null) {
    const filename = remotePath.split("/").pop();
    const totalSize = buffer.length;
    const fileSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    const progressId =
      uploadId ||
      `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let loadedBytes = 0;
    const startTime = Date.now();

    // Create a NEW FTP client for this upload operation
    const client = new ftp.Client(timeout);

    try {
      // Initialize progress
      uploadProgress.set(progressId, {
        loaded: 0,
        total: totalSize,
        percentage: 0,
        speed: 0,
        elapsed: 0,
        status: "connecting",
        filename: filename,
      });

      logger.info(
        `[UPLOAD] Starting upload ${progressId} - File: ${filename}, Size: ${fileSizeMB} MB`
      );

      // Configure access with extended timeout for large files
      const accessOptions = {
        ...this.config,
        timeout: this.timeout,
        passive: true,
      };

      // Use the new client instance
      await client.access(accessOptions);

      // Update status to uploading
      uploadProgress.set(progressId, {
        ...uploadProgress.get(progressId),
        status: "uploading",
      });

      logger.info(`[UPLOAD] Connected to FTP server: ${this.config.host}`);

      // Get full path with base path prepended
      const fullRemotePath = this.getFullPath(remotePath);

      // Ensure directory exists
      const dirPath = fullRemotePath.substring(
        0,
        fullRemotePath.lastIndexOf("/")
      );
      if (dirPath) {
        // Use the same client for directory creation
        const fullDirPath = this.getFullPath(dirPath, true);
        await client.ensureDir(fullDirPath);
        logger.info(`FTP: Directory ensured: ${fullDirPath}`);
      }

      // Create a progress tracking stream wrapper
      const sourceStream = Readable.from(buffer);

      // Create a Transform stream to track progress
      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          loadedBytes += chunk.length;

          // Calculate progress
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = loadedBytes / elapsed; // bytes per second
          const percentage = Math.min(
            Math.round((loadedBytes / totalSize) * 100),
            100
          );

          // Update progress every 1% or every 100KB, whichever comes first
          const lastProgress = uploadProgress.get(progressId);
          const lastPercentage = lastProgress ? lastProgress.percentage : 0;

          if (
            percentage !== lastPercentage ||
            loadedBytes % (100 * 1024) === 0
          ) {
            uploadProgress.set(progressId, {
              loaded: loadedBytes,
              total: totalSize,
              percentage: percentage,
              speed: speed,
              elapsed: Math.round(elapsed),
              status: "uploading",
              filename: filename,
            });

            // Log progress every 10%
            if (percentage % 10 === 0 && percentage !== lastPercentage) {
              logger.info(
                `[UPLOAD] Progress ${progressId}: ${percentage}% (${(
                  loadedBytes /
                  1024 /
                  1024
                ).toFixed(2)} MB / ${fileSizeMB} MB)`
              );
            }
          }

          this.push(chunk);
          callback();
        },
      });

      // Pipe source stream through progress tracker
      sourceStream.pipe(progressStream);

      // Upload file using progress stream with the new client
      await client.uploadFrom(progressStream, fullRemotePath);

      // Update to completed
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const avgSpeed = totalSize / parseFloat(totalTime);

      uploadProgress.set(progressId, {
        loaded: totalSize,
        total: totalSize,
        percentage: 100,
        speed: avgSpeed,
        elapsed: Math.round(parseFloat(totalTime)),
        status: "completed",
        filename: filename,
      });

      logger.info(
        `[UPLOAD] Completed ${progressId} - ${fileSizeMB} MB in ${totalTime}s`
      );

      // Auto-cleanup progress after 5 minutes
      setTimeout(() => {
        this.clearProgress(progressId);
      }, 5 * 60 * 1000);

      // Return URL path
      const baseUrl = Credentials.FTP_BASE_URL || "";
      const cleanPath = remotePath.replace(/^[.\\/]+/, "").replace(/\\/g, "/");
      const urlPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
      const finalUrl = `${baseUrl}${urlPath}`;

      return finalUrl;
    } catch (err) {
      // Update status to error
      if (uploadProgress.has(progressId)) {
        uploadProgress.set(progressId, {
          ...uploadProgress.get(progressId),
          status: "error",
          error: err.message,
        });
      }

      logger.error(`[UPLOAD] Failed ${progressId} - ${err.message}`);
      throw err;
    } finally {
      // Close this specific client instance
      client.close();
    }
  }

  /**
   * Ensure directory exists on FTP server
   * @param {string} dirPath - Directory path (may already include base path)
   * @param {boolean} alreadyHasBasePath - If true, path already includes base path
   */
  async ensureDirectory(dirPath, alreadyHasBasePath = false) {
    // This method is now only used internally, so we don't need it to create its own client
    // Directory creation is handled within uploadFile
    // But keep this for backwards compatibility if needed elsewhere
    const client = new ftp.Client(timeout);
    try {
      const fullDirPath = this.getFullPath(dirPath, alreadyHasBasePath);
      await client.access(this.config);
      await client.ensureDir(fullDirPath);
      logger.info(`FTP: Directory ensured: ${fullDirPath}`);
    } catch (err) {
      logger.error(`FTP directory creation error: ${err.message}`);
      throw err;
    } finally {
      client.close();
    }
  }

  /**
   * Delete a file from FTP server
   * @param {string} remotePath - Remote file path
   */
  async deleteFile(remotePath) {
    const client = new ftp.Client(timeout);
    try {
      await client.access(this.config);
      const fullPath = this.getFullPath(remotePath);
      await client.remove(fullPath);
      logger.info(`FTP: File deleted: ${fullPath}`);
    } catch (err) {
      logger.error(`FTP delete error: ${err.message}`);
      throw err;
    } finally {
      client.close();
    }
  }

  /**
   * List files in a directory
   * @param {string} remoteDir - Remote directory path
   * @returns {Promise<Array>} - List of file names
   */
  async listFiles(remoteDir) {
    const client = new ftp.Client(timeout);
    try {
      await client.access(this.config);
      const fullPath = this.getFullPath(remoteDir);
      const files = await client.list(fullPath);
      return files.map((f) => f.name);
    } catch (err) {
      logger.error(`FTP list error: ${err.message}`);
      return [];
    } finally {
      client.close();
    }
  }

  /**
   * Download a file from FTP server to a buffer
   * @param {string} remotePath - Remote file path
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFile(remotePath) {
    const client = new ftp.Client(timeout);
    try {
      await client.access(this.config);
      logger.info(`FTP: Connected to ${this.config.host} for download`);

      const chunks = [];
      const fullPath = this.getFullPath(remotePath);

      await client.downloadTo(async (data) => {
        chunks.push(data);
      }, fullPath);

      const fileBuffer = Buffer.concat(chunks);
      logger.info(
        `FTP: File downloaded: ${fullPath} (${fileBuffer.length} bytes)`
      );
      return fileBuffer;
    } catch (err) {
      logger.error(`FTP download error: ${err.message}`);
      throw err;
    } finally {
      client.close();
    }
  }
}

module.exports = new FTPService();
