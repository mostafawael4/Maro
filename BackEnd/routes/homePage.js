import express from "express";
import multer from "multer";
import HomePage from "../models/HomePage.js";
const router = express.Router();
import path  from "path";
import Credential from "../config/Credentials.js";
import uploadService from "../services/upload.service.js";
import allowedExtensions from "../config/allowed_extensions.js";
import logger from "../utils/logger.js";
import { handleMulterErrors } from "../middleware/upload.js";

// Upload image to home page

const storage = multer.memoryStorage(); // Use memory storage to access buffer
const uploadMemory = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // up to 2GB
  fileFilter: (req, file, cb) => {
    const allowed = [...allowedExtensions.images];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed!"));
  },
}).array("images", 30);

router.post("/upload", uploadMemory, handleMulterErrors, async (req, res) => {
  logger.info("Received homePage upload request.");
  try {
    const files = req.files || [];
    if (!files.length) {
      logger.warn("No files uploaded in homePage upload.");
      return res.status(400).json({ error: "No files uploaded" });
    }
    const results = [];
    for (const file of files) {
      logger.info(`Processing file for homePage upload: ${file.originalname}`);
      const fileUrl = await uploadService.saveFile(
        undefined,
        file.buffer,
        file.originalname,
        { isHomePage: true }
      );
      logger.info(`Saved homePage file: ${fileUrl}`);

      // Save to HomePage collection
      const newImage = await HomePage.create({
        filename: fileUrl.split("/").pop(),
        url: fileUrl,
        uploadedAt: new Date(),
      });
      logger.info(`HomePage image record created: ${newImage.filename}`);
      results.push(newImage);
    }
    logger.info(
      `HomePage upload successful. Total images uploaded: ${results.length}`
    );
    res
      .status(201)
      .json(
        Array.isArray(results) && results.length === 1 ? results[0] : results
      );
  } catch (err) {
    logger.error("HomePage upload error:", err);
    res.status(500).json({ error: "Failed to upload image to home page" });
  }
});

// Get all homePage images
router.get("/", async (req, res) => {
  logger.info("Fetching all homePage images.");
  try {
    const images = await HomePage.find().sort({ uploadedAt: -1 });
    logger.info(`Fetched ${images.length} homePage images.`);
    res.json(images);
  } catch (err) {
    logger.error("Error fetching all homePage images:", err);
    res.status(500).json({ error: "Failed to fetch homePage images" });
  }
});

// Delete a homePage image by _id or filename
router.delete("/delete", async (req, res) => {
  const { id, fileName } = req.body;
  let imageToDelete = null;
  let identifier;

  if (id) {
    identifier = id;
    logger.info(`Received request to delete homePage image by id: ${id}`);
  } else if (fileName) {
    identifier = fileName;
    logger.info(`Received request to delete homePage image by fileName: ${fileName}`);
  } else {
    logger.warn(`No id or fileName provided for homePage delete`);
    return res.status(400).json({ error: "Must provide either id or fileName" });
  }

  try {
    // First, find the record (but don't delete yet)
    if (id) {
      const isObjectId = /^[a-f\d]{24}$/i.test(id);
      if (isObjectId) {
        logger.info(`Trying to find homePage image by _id: ${id}`);
        imageToDelete = await HomePage.findById(id);
      }
    }
    if (!imageToDelete && fileName) {
      logger.info(`Trying to find homePage image by filename: ${fileName}`);
      imageToDelete = await HomePage.findOne({ filename: fileName });
    }

    if (!imageToDelete) {
      logger.warn(
        `HomePage image not found for delete: ${identifier}`
      );
      return res.status(404).json({ error: "HomePage image not found" });
    }

    // Now, remove the file from B2 before deleting the DB record
    try {
      await uploadService.deleteFile(undefined, imageToDelete.filename, { isHomePage: true });
      logger.info(`Deleted homePage file from B2: ${imageToDelete.filename}`);
    } catch (fileErr) {
      logger.error(`Failed to delete homePage file from B2 (${imageToDelete.filename}): ${fileErr.message}`);
      return res.status(500).json({ error: `Failed to delete homePage file from B2: ${fileErr.message}` });
    }

    // Now delete the DB record
    let deletedImage = null;
    if (imageToDelete._id) {
      deletedImage = await HomePage.findByIdAndDelete(imageToDelete._id);
    } else if (imageToDelete.filename) {
      deletedImage = await HomePage.findOneAndDelete({ filename: imageToDelete.filename });
    }

    logger.info(
      `HomePage image deleted successfully: ${deletedImage?.filename || deletedImage?._id}`
    );
    res.json({ ok: true, deletedImage });
  } catch (err) {
    logger.error("Failed to delete homePage image:", err);
    res.status(500).json({ error: "Failed to delete homePage image" });
  }
});

export default router;

