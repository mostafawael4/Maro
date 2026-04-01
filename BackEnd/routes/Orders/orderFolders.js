import express from "express";
const router = express.Router();
import mongoose from "mongoose";
import Order from "../../models/order.js";
import { requireAdminAuth } from "../../middleware/auth.js";
import uploadService from "../../services/upload.service.js";
import multer from "multer";
import allowedExtensions from "../../config/allowed_extensions.js";
import logger from "../../utils/logger.js";
import { handleMulterErrors } from "../../middleware/upload.js";
import { deleteOrderFileByFileName } from "../../services/order.service.js";
import Credentials from '../../config/Credentials.js';
import { signOrderFiles } from "../../utils/signingUtils.js";
import archiver from 'archiver';
import { PassThrough } from 'stream';
import b2 from '../../services/b2.service.js';
import websocketService from '../../services/websocket.service.js';

// Number of files downloaded from B2 simultaneously inside the background zip job.
// Higher = faster build, more RAM. 8 concurrent × ~3MB avg JPEG = ~24MB overhead.
const ZIP_DOWNLOAD_CONCURRENCY = 8;

// Collect a readable stream into a single Buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// In-memory job status store — allows polling fallback when WebSocket disconnects (e.g. screen lock)
// Structure: jobId → { status, downloadUrl, folderName, totalFiles, error, createdAt }
const zipJobs = new Map();

// Clean up expired jobs every 30 minutes (jobs expire after 2 hours, same as the zip in B2)
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [jobId, job] of zipJobs.entries()) {
    if (job.createdAt < cutoff) zipJobs.delete(jobId);
  }
}, 30 * 60 * 1000);


// GET /:orderId - return order's folders count and names (admin only)
router.get("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Use distinct to get unique folder names directly from MongoDB
    const folders = await Order.distinct("media.foldername", { _id: orderId });

    return res.json({
      ok: true,
      count: folders.length,
      folders: folders
    });
  } catch (err) {
    logger.error(`GET /${req.params.orderId}/folders failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});

router.get("/:orderId/:foldername", requireAdminAuth, async (req, res) => {
  const { orderId, foldername } = req.params

  try {
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const filteredMedia = result[0].media || [];
    const signedMedia = await signOrderFiles(orderId, filteredMedia);

    return res.json({
      ok: true,
      foldername,
      count: signedMedia.length,
      media: signedMedia
    });

  } catch (err) {
    logger.error(`GET /${orderId}/${foldername} failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
})

// DELETE /:orderId/folder/:foldername - delete all files in a folder for a given order
router.delete("/:orderId/:foldername", requireAdminAuth, async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  try {
    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaInFolder = result[0].media || [];
    if (mediaInFolder.length === 0) {
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}' for order ${orderId}` });
    }
    const filenames = mediaInFolder.map(item => item.filename);

    // Delete all files in the folder
    const failedDeletions = [];
    for (const filename of filenames) {
      try {
        await deleteOrderFileByFileName(orderId, filename);
      } catch (deleteErr) {
        logger.error(`Error deleting file '${filename}' in folder '${foldername}' for orderId ${orderId}: ${deleteErr.stack || deleteErr.message || deleteErr}`);
        failedDeletions.push({ filename, error: deleteErr.message || deleteErr });
      }
    }

    if (failedDeletions.length > 0) {
      return res.status(500).json({
        ok: false,
        message: `Failed to delete some files in folder '${foldername}' for order ${orderId}`,
        failedFiles: failedDeletions
      });
    }

    return res.json({ ok: true, orderId, foldername, deletedCount: filenames.length });
  } catch (err) {
    logger.error(`DELETE /${orderId}/folder/${foldername} failed: ${err.stack || err}`);
    return res.status(500).json({ ok: false, message: "Server error", error: err.message });
  }
});


// GET /:orderId/:foldername/download - stream folder as zip file (admin only)
router.get("/:orderId/:foldername/download", async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    logger.warn(`Download folder request missing orderId or foldername`);
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  try {
    // Use aggregation to fetch only media items belonging to this folder
    const result = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      {
        $project: {
          media: {
            $filter: {
              input: "$media",
              as: "m",
              cond: { $eq: ["$$m.foldername", foldername] }
            }
          }
        }
      }
    ]);

    if (!result || result.length === 0) {
      logger.warn(`Order not found for folder download: ${orderId}`);
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaInFolder = result[0].media || [];

    if (mediaInFolder.length === 0) {
      logger.warn(`No media found in folder '${foldername}' for order ${orderId}`);
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}'` });
    }

    logger.info(`Starting streaming zip download for folder '${foldername}' in order ${orderId} (${mediaInFolder.length} files)`);

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${foldername}.zip"`);
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering for streaming
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Create archiver instance with NO compression for speed
    const archive = archiver('zip', {
      zlib: { level: 0 }, // Level 0 is No compression
      forceZip64: true   // Support for files > 4GB or many files
    });

    // Pipe archive to response
    archive.pipe(res);

    // Handle archiver errors
    archive.on('error', (err) => {
      logger.error(`Archiver error for folder '${foldername}' in order ${orderId}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'Failed to create zip file' });
      }
    });

    // Disable timeout for this request as it involves streaming large amount of data
    req.setTimeout(0);

    // Track abort state and current stream
    let aborted = false;
    let currentStream = null;

    // Handle client disconnection — only abort if the response wasn't already fully sent
    req.on('close', () => {
      if (res.writableEnded) return; // Normal close after download completed, do nothing
      logger.info(`Download client disconnected for folder '${foldername}' in order ${orderId}. Aborting archiver.`);
      aborted = true;
      if (currentStream) currentStream.destroy();
      archive.abort();
    });

    // Track progress
    let processedFiles = 0;

    // Process files sequentially to avoid opening too many connections (which causes timeouts)
    for (const media of mediaInFolder) {
      if (aborted) break;

      try {
        const key = `orders/${orderId}/${media.filename}`;
        const fileName = media.originalName || media.filename;

        // Get stream from B2
        currentStream = await b2.downloadFileStream(key);

        // Append to archive and wait for it to be consumed
        // This ensures we don't open the next B2 connection until the current one is done
        await new Promise((resolve, reject) => {
          currentStream.on('end', () => {
            processedFiles++;
            // Log every 5 files to avoid spamming logs, or if it's the last one
            if (processedFiles % 5 === 0 || processedFiles === mediaInFolder.length) {
              logger.info(`Streamed file ${processedFiles}/${mediaInFolder.length}: ${fileName}`);
            }
            resolve();
          });

          currentStream.on('error', (err) => {
            logger.error(`Stream error for ${fileName}: ${err.message}`);
            // Don't reject, just resolve so we continue to next file (partial zip is better than no zip)
            resolve();
          });

          archive.append(currentStream, { name: fileName });
        });

      } catch (error) {
        if (aborted) break;
        logger.error(`Failed to process file ${media.filename}: ${error.message}`);
        // Continue with other files
      }
    }

    // Finalize the archive only if not aborted
    if (!aborted) {
      await archive.finalize();
    }

    logger.info(`Successfully streamed zip for folder '${foldername}' in order ${orderId} (${processedFiles}/${mediaInFolder.length} files)`);
    // No res.end() here - archiver.pipe(res) handles it once finalized and flushed
  } catch (err) {
    logger.error(`GET /:orderId/:foldername/download failed: ${err.stack || err}`);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error", error: err.message });
    }
  }
});


// POST /:orderId/:foldername/prepare-download
// Builds zip in background, uploads to B2, notifies client via WebSocket (admin) or polling (client).
// Avoids mobile browser timeouts caused by long-running streaming responses.
router.post("/:orderId/:foldername/prepare-download", async (req, res) => {
  const { orderId, foldername } = req.params;
  const adminId = req.session?.adminId;
  const clientEmail = req.body?.clientEmail || null;

  if (!orderId || !foldername) {
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  try {
    // Access control: must be an authenticated admin OR provide a matching client email
    const order = await Order.findById(orderId).select('email media').lean();
    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const isAdmin = !!adminId;
    const isClient = clientEmail && order.email &&
      order.email.trim().toLowerCase() === clientEmail.trim().toLowerCase();

    if (!isAdmin && !isClient) {
      return res.status(403).json({ ok: false, message: "Access denied" });
    }

    const mediaInFolder = (order.media || []).filter(m => m.foldername === foldername);
    if (mediaInFolder.length === 0) {
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}'` });
    }

    const jobId = `zip-${orderId}-${foldername}-${Date.now()}`;

    // Register job as pending so polling can find it immediately
    zipJobs.set(jobId, { status: 'pending', folderName: foldername, totalFiles: mediaInFolder.length, createdAt: Date.now() });

    // Respond immediately so the client connection can close
    res.json({ ok: true, jobId, totalFiles: mediaInFolder.length, message: 'Preparing download in background...' });

    // Start background job without awaiting it
    // adminId is null for client users — WebSocket notification is skipped, polling is their channel
    buildAndUploadZip(orderId, foldername, mediaInFolder, adminId, jobId).catch(err => {
      logger.error(`Background zip job ${jobId} failed: ${err.message}`);
      zipJobs.set(jobId, { status: 'error', folderName: foldername, error: 'Failed to prepare download. Please try again.', createdAt: Date.now() });
      if (adminId) {
        websocketService.sendToClient(adminId, {
          type: 'folderDownloadError',
          payload: { jobId, orderId, folderName: foldername, error: 'Failed to prepare download. Please try again.' }
        });
      }
    });

  } catch (err) {
    logger.error(`POST prepare-download failed: ${err.stack || err}`);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
});

async function buildAndUploadZip(orderId, foldername, mediaInFolder, adminId, jobId) {
  const zipFileName = `zips/${orderId}/${foldername}-${Date.now()}.zip`;
  logger.info(`[${jobId}] Background zip started: ${zipFileName} (${mediaInFolder.length} files)`);

  const passthrough = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 0 }, forceZip64: true });

  archive.on('error', (err) => {
    logger.error(`[${jobId}] Archiver error: ${err.message}`);
    passthrough.destroy(err);
  });

  archive.pipe(passthrough);

  // Start the B2 large file upload consuming the passthrough stream concurrently
  const uploadPromise = b2.uploadLargeFileStream(zipFileName, passthrough);

  // Download ZIP_DOWNLOAD_CONCURRENCY files from B2 in parallel, buffer each, then
  // append the buffer to the archiver. Buffers are small (~avg file size) and freed
  // as soon as archiver consumes them. This gives ~5x speedup vs sequential.
  let processedFiles = 0;
  const queue = [...mediaInFolder];

  await new Promise((resolve) => {
    let active = 0;
    let settled = false;

    const checkDone = () => {
      if (!settled && queue.length === 0 && active === 0) {
        settled = true;
        resolve();
      }
    };

    const processNext = () => {
      while (active < ZIP_DOWNLOAD_CONCURRENCY && queue.length > 0) {
        const media = queue.shift();
        active++;

        const key = `orders/${orderId}/${media.filename}`;
        const fileName = media.originalName || media.filename;

        b2.downloadFileStream(key)
          .then(stream => streamToBuffer(stream))
          .then(buffer => {
            archive.append(buffer, { name: fileName });
            processedFiles++;
            if (processedFiles % 50 === 0 || processedFiles === mediaInFolder.length) {
              logger.info(`[${jobId}] Zipped ${processedFiles}/${mediaInFolder.length} files`);
            }
          })
          .catch(err => {
            logger.error(`[${jobId}] Failed to add ${fileName}: ${err.message}`);
          })
          .finally(() => {
            active--;
            checkDone();
            processNext();
          });
      }
      checkDone();
    };

    processNext();
  });

  await archive.finalize();
  const uploadResult = await uploadPromise;

  logger.info(`[${jobId}] Upload complete. Generating presigned URL...`);

  const downloadUrl = await b2.getPresignedUrl(zipFileName);

  // Store result so polling can retrieve it even if WebSocket is disconnected
  zipJobs.set(jobId, {
    status: 'ready',
    folderName: foldername,
    downloadUrl,
    totalFiles: processedFiles,
    createdAt: Date.now()
  });

  // Also notify via WebSocket for clients that are still connected
  // Notify via WebSocket only for admins (clients use polling instead)
  if (adminId) {
    websocketService.sendToClient(adminId, {
      type: 'folderDownloadReady',
      payload: { jobId, orderId, folderName: foldername, downloadUrl, totalFiles: processedFiles }
    });
  }

  logger.info(`[${jobId}] Download ready. Job store updated${adminId ? ' + WS notified' : ' (client will poll)'}`);

  // Auto-cleanup the zip from B2 after 2 hours
  setTimeout(async () => {
    try {
      await b2.deleteFileById(uploadResult.fileId, uploadResult.fileName);
      logger.info(`[${jobId}] Cleaned up zip: ${zipFileName}`);
    } catch (err) {
      logger.error(`[${jobId}] Cleanup failed for ${zipFileName}: ${err.message}`);
    }
  }, 2 * 60 * 60 * 1000);
}

// GET /:orderId/:foldername/download-status/:jobId
// Polling fallback — lets the frontend check job progress when WebSocket is unavailable (screen lock, etc.)
// Open to both admins and clients (jobId is unguessable, acts as a capability token)
router.get("/:orderId/:foldername/download-status/:jobId", async (req, res) => {
  const { jobId } = req.params;
  const job = zipJobs.get(jobId);

  if (!job) {
    // Job not found — either expired or invalid jobId, treat as still pending
    return res.json({ ok: true, status: 'pending' });
  }

  return res.json({ ok: true, ...job });
});

export default router;
