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


// GET /:orderId - return order's folders count, names, and sizes (admin only)
router.get("/:orderId", requireAdminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId is required" });
    }

    // Aggregate: get distinct folder names AND sum file sizes per folder in one query
    const sizeAgg = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
      { $unwind: "$media" },
      { $match: { "media.foldername": { $ne: null } } },
      {
        $group: {
          _id: "$media.foldername",
          totalSize: { $sum: { $ifNull: ["$media.size", 0] } }
        }
      }
    ]);

    const folders = sizeAgg.map(g => g._id);
    // Build a { folderName: sizeInBytes } map so the frontend can show e.g. "1.3 GB"
    const folderSizes = {};
    for (const g of sizeAgg) {
      folderSizes[g._id] = g.totalSize;
    }

    return res.json({
      ok: true,
      count: folders.length,
      folders,
      folderSizes  // e.g. { "Album 1": 1400000000, "Album 2": 800000000 }
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
    // Sum the stored file sizes — no B2 calls needed
    const folderSize = filteredMedia.reduce((sum, m) => sum + (m.size || 0), 0);
    const signedMedia = await signOrderFiles(orderId, filteredMedia);

    return res.json({
      ok: true,
      foldername,
      count: signedMedia.length,
      folderSize,  // total bytes for this folder
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


// GET /:orderId/:foldername/download - stream folder as zip directly to client
// Memory-safe: pipes B2 streams → archiver → response, never buffers the whole zip.
// Cleanup: on disconnect or error, B2 stream is destroyed and archiver is aborted.
router.get("/:orderId/:foldername/download", async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    logger.warn(`Download folder request missing orderId or foldername`);
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  // Track state so cleanup helpers can reference them
  let archive = null;
  let currentStream = null;
  let aborted = false;

  // Central cleanup — safe to call multiple times
  const cleanup = (reason) => {
    if (aborted) return;
    aborted = true;
    logger.info(`[download cleanup] ${reason} — folder '${foldername}' order ${orderId}`);
    try { if (currentStream && !currentStream.destroyed) currentStream.destroy(); } catch (_) {}
    try { if (archive) archive.abort(); } catch (_) {}
  };

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

    logger.info(`Starting streaming zip for '${foldername}' in order ${orderId} (${mediaInFolder.length} files)`);

    // Set response headers for zip download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(foldername)}.zip"`);
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Level 0 = store-only (no CPU cost), forceZip64 handles >4 GB folders
    archive = archiver('zip', { zlib: { level: 0 }, forceZip64: true });

    // Archiver error → cleanup and close
    archive.on('error', (err) => {
      logger.error(`Archiver error for '${foldername}': ${err.message}`);
      cleanup('archiver error');
      if (!res.headersSent) res.status(500).json({ ok: false, message: 'Zip creation failed' });
      else if (!res.writableEnded) res.end();
    });

    // Pipe: archiver → HTTP response (chunks flow directly, nothing buffered in full)
    archive.pipe(res);

    // Client disconnects mid-download — abort everything, nothing lingers on server
    req.on('close', () => {
      if (res.writableEnded) return; // Normal close after complete download
      cleanup('client disconnected');
    });

    // Response stream error (e.g. network reset)
    res.on('error', (err) => {
      logger.error(`Response stream error for '${foldername}': ${err.message}`);
      cleanup('response stream error');
    });

    // Disable HTTP timeout — large folders can take minutes to stream
    req.setTimeout(0);
    res.setTimeout && res.setTimeout(0);

    // Track progress
    let processedFiles = 0;

    // Sequential: one B2 connection at a time.
    // Memory peak = one file's in-flight chunk (~KB), not the whole folder.
    for (const media of mediaInFolder) {
      if (aborted) break;

      const key = `orders/${orderId}/${media.filename}`;
      const fileName = media.originalName || media.filename;

      try {
        currentStream = await b2.downloadFileStream(key);

        await new Promise((resolve) => {
          currentStream.on('end', () => {
            currentStream = null;
            processedFiles++;
            if (processedFiles % 10 === 0 || processedFiles === mediaInFolder.length) {
              logger.info(`Streamed ${processedFiles}/${mediaInFolder.length} files for '${foldername}'`);
            }
            resolve();
          });

          currentStream.on('error', (err) => {
            logger.error(`B2 stream error for ${fileName}: ${err.message}`);
            // Skip the broken file — partial zip beats no zip
            currentStream = null;
            resolve();
          });

          // Append stream; archiver consumes it chunk-by-chunk, forwarding to res
          archive.append(currentStream, { name: fileName });
        });

      } catch (err) {
        if (aborted) break;
        logger.error(`Failed to fetch ${fileName} from B2: ${err.message}`);
        // Continue with remaining files
      }
    }

    // Finalize only if download was not aborted
    if (!aborted) {
      await archive.finalize();
      logger.info(`Zip streamed for '${foldername}' (${processedFiles}/${mediaInFolder.length} files) — server RAM freed`);
    }
    // archive.pipe(res) closes res automatically after finalize flushes.
    // Nothing to delete from server — streaming leaves zero temp files.

  } catch (err) {
    logger.error(`GET /:orderId/:foldername/download failed: ${err.stack || err}`);
    cleanup('unexpected error');
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error", error: err.message });
    }
    if (!res.writableEnded) res.end();
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
