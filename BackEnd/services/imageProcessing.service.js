import b2Service from "./b2.service.js";
import logger from "../utils/logger.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const SIZES = {
    thumbnail: { width: 400, suffix: 'thumb' },
    medium: { width: 1200, suffix: 'medium' },
    hero: { width: 2000, suffix: 'hero' }
};

class ImageProcessingService {

    /**
     * Process an image from B2: Download -> Resize/Convert -> Upload -> Return URLs
     * @param {string} fileKey - The B2 key of the original file (e.g., 'gallery/image.jpg')
     * @returns {Promise<Object>} - { thumbnail, medium, hero } URLs
     */
    async processImage(fileKey) {
        const tempDir = path.resolve('tmp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const uniqueId = Date.now() + Math.random().toString(36).substring(7);
        // Use path.posix for B2 keys to ensure forward slashes on all OSs
        const originalExt = path.posix.extname(fileKey);
        const baseName = path.posix.basename(fileKey, originalExt);
        const dirName = path.posix.dirname(fileKey); // e.g., 'gallery'

        const localOriginalPath = path.join(tempDir, `${uniqueId}-original${originalExt}`);

        try {
            logger.info(`Processing image: ${fileKey}`);

            // 1. Download original file
            const fileBuffer = await b2Service.downloadFileByName(fileKey);
            fs.writeFileSync(localOriginalPath, Buffer.from(fileBuffer));

            const processedUrls = {};

            // 2. Generate sizes
            for (const [sizeName, config] of Object.entries(SIZES)) {
                const { width, suffix } = config;
                const newFileName = `${baseName}-${suffix}.webp`;
                const newFileKey = `${dirName}/${newFileName}`;
                const localDestPath = path.join(tempDir, `${uniqueId}-${suffix}.webp`);

                // Resize and convert to WebP
                await sharp(localOriginalPath)
                    .resize({ width, withoutEnlargement: true }) // Maintain aspect ratio, don't upscale
                    .webp({ quality: 80 })
                    .toFile(localDestPath);

                // Upload to B2
                const processedBuffer = fs.readFileSync(localDestPath);
                await b2Service.upload(newFileKey, processedBuffer);

                // Get Public URL
                processedUrls[sizeName] = b2Service.getFileUrl(newFileKey);
                logger.info(`Generated ${sizeName} for ${fileKey}: ${processedUrls[sizeName]}`);

                // Cleanup processed file
                if (fs.existsSync(localDestPath)) fs.unlinkSync(localDestPath);
            }

            return processedUrls;

        } catch (error) {
            logger.error(`Image processing failed for ${fileKey}: ${error.message}`);
            throw error;
        } finally {
            // Cleanup original downloaded file
            if (fs.existsSync(localOriginalPath)) fs.unlinkSync(localOriginalPath);
        }
    }
}

export default new ImageProcessingService();
