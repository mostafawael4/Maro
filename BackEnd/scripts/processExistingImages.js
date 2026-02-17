import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert import.meta.url to __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

import Credentials from '../config/Credentials.js';
import Gallery from '../models/Gallery.js';
import HomePage from '../models/HomePage.js';
import imageProcessingService from '../services/imageProcessing.service.js';
import logger from '../utils/logger.js';

const connectDB = async () => {
    try {
        console.log('Connecting to MongoDB:', Credentials.MONGO_URI.replace(/:([^:@]+)@/, ':****@'));
        await mongoose.connect(Credentials.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connected for Migration');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const processCollection = async (Model, contextType) => {
    console.log(`Checking ${contextType} for unprocessed images...`);
    const images = await Model.find({
        $or: [{ medium: { $exists: false } }, { hero: { $exists: false } }]
    });

    console.log(`Found ${images.length} ${contextType} images to process.`);

    for (const img of images) {
        try {
            console.log(`Processing ${img.filename}...`);

            // Determine key based on context logic in upload.service.js
            // Gallery: gallery/filename
            // HomePage: homepage/filename
            const folder = contextType === 'Gallery' ? 'gallery' : 'homepage';
            const key = `${folder}/${img.filename}`;

            const processedUrls = await imageProcessingService.processImage(key);

            img.thumbnail = processedUrls.thumbnail;
            img.medium = processedUrls.medium;
            img.hero = processedUrls.hero;
            await img.save();

            console.log(`Saved optimized versions for ${img.filename}`);
        } catch (err) {
            console.error(`Failed to process ${img.filename}:`, err.message);
            // Continue to next image
        }
    }
};

const runMigration = async () => {
    await connectDB();

    await processCollection(Gallery, 'Gallery');
    await processCollection(HomePage, 'HomePage');

    console.log('Migration completed.');
    process.exit(0);
};

runMigration();
