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
import ZipJob from '../../models/zipJob.js';

// Number of files downloaded from B2 simultaneously inside the background zip job.
// 32 concurrent × ~3MB avg JPEG ≈ 96MB RAM overhead — well within Railway's 8 GB limit.
// Increases build speed ~4× compared to the previous value of 8.
const ZIP_DOWNLOAD_CONCURRENCY = 16; // Safely balanced for high-speed without B2 503 errors

// Collect a readable stream into a single Buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// --- Job helpers (MongoDB-backed, survives server restarts) ---
async function createJob(jobId, folderName, totalFiles) {
  await ZipJob.create({ _id: jobId, status: 'pending', folderName, totalFiles, filesProcessed: 0, progress: 0 });
}

async function updateJob(jobId, fields) {
  await ZipJob.findByIdAndUpdate(jobId, fields);
}

async function getJob(jobId) {
  return ZipJob.findById(jobId).lean();
}


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


router.get("/:orderId/:foldername/download", async (req, res) => {
  const { orderId, foldername } = req.params;

  if (!orderId || !foldername) {
    logger.warn(`Download folder request missing orderId or foldername`);
    return res.status(400).json({ ok: false, message: "orderId and foldername are required" });
  }

  // --- Response Headers for Maximum Stability (especially iOS Safari) ---
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(foldername)}.zip"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Track state so cleanup helpers can reference them
  let archive = null;
  let currentStream = null;
  let aborted = false;

  // Central cleanup
  const cleanup = (reason) => {
    if (aborted) return;
    aborted = true;
    logger.info(`[download cleanup] ${reason} — folder '${foldername}' order ${orderId}`);
    try { if (currentStream && !currentStream.destroyed) currentStream.destroy(); } catch (_) { }
    try { if (archive) archive.abort(); } catch (_) { }
  };

  try {
    // 1. Fetch media items for this folder
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
      cleanup('order not found');
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    const mediaInFolder = result[0].media || [];
    if (mediaInFolder.length === 0) {
      logger.warn(`No media found in folder '${foldername}' for order ${orderId}`);
      cleanup('no media');
      return res.status(404).json({ ok: false, message: `No media found in folder '${foldername}'` });
    }

    logger.info(`Starting streaming zip for '${foldername}' in order ${orderId} (${mediaInFolder.length} files)`);

    // 3. Initialize Archiver
    archive = archiver('zip', { zlib: { level: 0 }, forceZip64: true });

    archive.on('error', (err) => {
      logger.error(`Archiver error for '${foldername}': ${err.message}`);
      cleanup('archiver error');
      if (!res.headersSent) res.status(500).json({ ok: false, message: 'Zip creation failed' });
      else if (!res.writableEnded) res.end();
    });

    archive.pipe(res);

    // 4. Handle Disconnection
    req.on('close', () => {
      if (res.writableEnded) return;
      cleanup('client disconnected');
    });

    res.on('error', (err) => {
      logger.error(`Response stream error for '${foldername}': ${err.message}`);
      cleanup('response stream error');
    });

    req.setTimeout(0);
    if (res.setTimeout) res.setTimeout(0);

    // 5. Stream from B2 to Archiver
    let processedFiles = 0;
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
            currentStream = null;
            resolve(); // Skip to next file
          });

          archive.append(currentStream, { name: fileName });
        });
      } catch (err) {
        if (aborted) break;
        logger.error(`Failed to fetch ${fileName} from B2: ${err.message}`);
      }
    }

    // 6. Finalize
    if (!aborted) {
      await archive.finalize();
      logger.info(`Zip streamed successfully: '${foldername}' order ${orderId}`);
    }

  } catch (err) {
    logger.error(`GET /:orderId/:foldername/download failed: ${err.stack || err}`);
    cleanup('unexpected error');
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "Server error", error: err.message });
    }
    if (!res.writableEnded) res.end();
  }
});


// Simple retry wrapper for B2 downloads to handle transient 503/500 errors
async function retryDownload(key, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await b2.downloadFileStream(key);
    } catch (err) {
      if (i === attempts - 1) throw err;
      const delay = Math.pow(2, i) * 1000;
      logger.warn(`B2 download failed for ${key}, retrying in ${delay}ms... (${err.message})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

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

    // Register job as pending in MongoDB so polling survives server restarts
    await createJob(jobId, foldername, mediaInFolder.length);

    // Respond immediately so the client connection can close
    res.json({ ok: true, jobId, totalFiles: mediaInFolder.length, message: 'Preparing download in background...' });

    // Start background job without awaiting it
    // adminId is null for client users — WebSocket notification is skipped, polling is their channel
    buildAndUploadZip(orderId, foldername, mediaInFolder, adminId, jobId).catch(async err => {
      logger.error(`Background zip job ${jobId} failed: ${err.message}`);
      await updateJob(jobId, { status: 'error', error: 'Failed to prepare download. Please try again.' });
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
  const total = mediaInFolder.length;
  logger.info(`[${jobId}] Background zip started: ${zipFileName} (${total} files, concurrency=${ZIP_DOWNLOAD_CONCURRENCY})`);

  await updateJob(jobId, { status: 'building' });

  const passthrough = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 0 }, forceZip64: true });

  archive.on('error', (err) => {
    logger.error(`[${jobId}] Archiver error: ${err.message}`);
    passthrough.destroy(err);
  });

  archive.pipe(passthrough);

  // Start the B2 large-file upload consuming the passthrough stream concurrently
  const uploadPromise = b2.uploadLargeFileStream(zipFileName, passthrough);

  // Download ZIP_DOWNLOAD_CONCURRENCY files from B2 in parallel, buffer each, then
  // append the buffer to the archiver. Freed as soon as archiver consumes them.
  let processedFiles = 0;
  const queue = [...mediaInFolder];

  // Throttle MongoDB progress writes: update every 10 files or on completion
  const PROGRESS_INTERVAL = 10;

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

        retryDownload(key)
          .then(stream => streamToBuffer(stream))
          .then(buffer => {
            archive.append(buffer, { name: fileName });
            processedFiles++;
            const progress = Math.round((processedFiles / total) * 100);

            // Update DB progress every PROGRESS_INTERVAL files or on last file
            if (processedFiles % PROGRESS_INTERVAL === 0 || processedFiles === total) {
              logger.info(`[${jobId}] Zipped ${processedFiles}/${total} files (${progress}%)`);
              updateJob(jobId, { filesProcessed: processedFiles, progress }).catch(() => {});
            }
          })
          .catch(err => {
            logger.error(`[${jobId}] Failed to add ${fileName}: ${err.message}`);
            // Still count as processed so progress doesn't stall
            processedFiles++;
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

  // Persist the ready state with download URL
  await updateJob(jobId, {
    status: 'ready',
    downloadUrl,
    filesProcessed: processedFiles,
    progress: 100,
  });

  // Notify via WebSocket for admins (clients use polling)
  if (adminId) {
    websocketService.sendToClient(adminId, {
      type: 'folderDownloadReady',
      payload: { jobId, orderId, folderName: foldername, downloadUrl, totalFiles: processedFiles }
    });
  }

  logger.info(`[${jobId}] Download ready${adminId ? ' + WS notified' : ' (client will poll)'}`);

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
// Polling fallback — lets the frontend check job progress when WebSocket is unavailable.
// Open to both admins and clients (jobId is unguessable, acts as a capability token).
router.get("/:orderId/:foldername/download-status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await getJob(jobId);

    if (!job) {
      // Not found — expired or invalid, treat as still pending
      return res.json({ ok: true, status: 'pending', progress: 0, filesProcessed: 0, totalFiles: 0 });
    }

    return res.json({
      ok: true,
      status: job.status,
      progress: job.progress ?? 0,
      filesProcessed: job.filesProcessed ?? 0,
      totalFiles: job.totalFiles ?? 0,
      downloadUrl: job.downloadUrl ?? null,
      folderName: job.folderName,
      error: job.error ?? null,
    });
  } catch (err) {
    logger.error(`GET download-status failed for ${jobId}: ${err.message}`);
    return res.json({ ok: true, status: 'pending', progress: 0, filesProcessed: 0, totalFiles: 0 });
  }
});

export default router;
