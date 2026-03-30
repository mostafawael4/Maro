import B2 from "backblaze-b2";
import Credentials from '../config/Credentials.js';
import logger from '../utils/logger.js';


class B2Service {
    constructor() {
        this.b2 = new B2({ applicationKeyId: Credentials.B2_APPLICATION_KEY_ID, applicationKey: Credentials.B2_APPLICATION_KEY });
        this.authPromise = null;
        this.authorizedAt = null;
        this.uploadUrlPool = [];
        this.maxPoolSize = 20;
        this.downloadUrl = null;
        this.nativeDownloadUrl = null;
        this.tokenCache = new Map();
    }

    async authorize() {
        try {
            // If token is older than 23h, force re-auth before it expires
            if (this.authPromise && this.authorizedAt && (Date.now() - this.authorizedAt > 23 * 60 * 60 * 1000)) {
                logger.info('B2: Auth token older than 23h, forcing re-authorization...');
                this.authPromise = null;
                this.uploadUrlPool = [];
                this.tokenCache.clear();
            }

            if (this.authPromise) return this.authPromise;

            if (!Credentials.B2_APPLICATION_KEY_ID || !Credentials.B2_APPLICATION_KEY) {
                logger.error("B2_APPLICATION_KEY_ID or B2_APPLICATION_KEY is missing in environment variables.");
                return Promise.reject(new Error("Missing B2 Credentials"));
            }

            this.authPromise = (async () => {
                try {
                    logger.info(`B2: Authorizing with Key ID: ${Credentials.B2_APPLICATION_KEY_ID.substring(0, 8)}...`);
                    const response = await this.b2.authorize();

                    this.nativeDownloadUrl = response.data.downloadUrl;
                    this.authorizedAt = Date.now();

                    // Use CDN URL if available, otherwise fall back to B2 download URL
                    if (Credentials.B2_CDN_URL) {
                        this.downloadUrl = Credentials.B2_CDN_URL.replace(/\/$/, ''); // Remove trailing slash if present
                        logger.info(`B2: Using CDN URL: ${this.downloadUrl} (Native: ${this.nativeDownloadUrl})`);
                    } else {
                        this.downloadUrl = this.nativeDownloadUrl;
                        logger.info(`B2: Authorized successfully. Download URL: ${this.downloadUrl}`);
                    }

                    // Clear pool on re-auth as old tokens might be invalid
                    this.uploadUrlPool = [];
                } catch (err) {
                    logger.error(`B2: Authorization failed: ${err.message}`);
                    this.authPromise = null; // Reset on failure so we can retry
                    throw err;
                }
            })();

            return this.authPromise;
        } catch (error) {
            logger.error(`B2: Authorization failed: ${error.message}`);
            this.authPromise = null; // Reset on failure so we can retry
            // throw error;
        }
    }

    async getPresignedUrl(key) {
        try {
            await this.authorize();
            if (!Credentials.B2_BUCKET_ID) throw new Error("B2_BUCKET_ID is missing");

            // Encode the key components to ensure valid URL
            const encodedKey = key.split('/').map(encodeURIComponent).join('/');

            const response = await this.b2.getDownloadAuthorization({
                bucketId: Credentials.B2_BUCKET_ID,
                fileNamePrefix: key, // Authorization is for the raw key name
                validDurationInSeconds: 86400,
            });
            const authorizationToken = response.data.authorizationToken;
            return `${this.downloadUrl}/file/${Credentials.B2_BUCKET_NAME}/${encodedKey}?Authorization=${authorizationToken}`;
        } catch (err) {
            logger.error(`B2: Presign Error for ${key}: ${err.message}`);
            // Fallback
            return this.getFileUrl(key);
        }
    }

    /**
     * Get a presigned URL using the native B2 domain (bypassing CDN)
     * Useful for tools like FFmpeg that might be blocked by CDN range request limits.
     * @param {string} key 
     * @returns {Promise<string>}
     */
    async getNativePresignedUrl(key) {
        try {
            await this.authorize();
            if (!Credentials.B2_BUCKET_ID) throw new Error("B2_BUCKET_ID is missing");

            const encodedKey = key.split('/').map(encodeURIComponent).join('/');

            const response = await this.b2.getDownloadAuthorization({
                bucketId: Credentials.B2_BUCKET_ID,
                fileNamePrefix: key,
                validDurationInSeconds: 86400,
            });
            const authorizationToken = response.data.authorizationToken;
            return `${this.nativeDownloadUrl}/file/${Credentials.B2_BUCKET_NAME}/${encodedKey}?Authorization=${authorizationToken}`;
        } catch (err) {
            logger.error(`B2: Native Presign Error for ${key}: ${err.message}`);
            return this.getFileUrl(key);
        }
    }

    async getFolderToken(prefix) {
        try {
            const now = Date.now();
            const cached = this.tokenCache.get(prefix);

            // Tokens are valid for 24h, we'll cache for 23h to be safe
            if (cached && (now - cached.timestamp < 23 * 60 * 60 * 1000)) {
                return cached.data;
            }

            await this.authorize();
            if (!Credentials.B2_BUCKET_ID) throw new Error("B2_BUCKET_ID is missing");

            const response = await this.b2.getDownloadAuthorization({
                bucketId: Credentials.B2_BUCKET_ID,
                fileNamePrefix: prefix,
                validDurationInSeconds: 86400,
            });

            const tokenData = {
                baseDownloadUrl: this.downloadUrl,
                authorizationToken: response.data.authorizationToken,
                bucketName: Credentials.B2_BUCKET_NAME
            };

            this.tokenCache.set(prefix, {
                data: tokenData,
                timestamp: now
            });

            return tokenData;
        } catch (err) {
            logger.error(`B2: Folder Token Error for ${prefix}: ${err.message}`);
            return null;
        }
    }

    async getUploadUrl() {
        await this.authorize();

        if (this.uploadUrlPool.length > 0) {
            return this.uploadUrlPool.pop();
        }

        const response = await this.b2.getUploadUrl({ bucketId: Credentials.B2_BUCKET_ID });
        return {
            uploadUrl: response.data.uploadUrl,
            authorizationToken: response.data.authorizationToken
        };
    }

    returnUploadUrl(urlData) {
        if (this.uploadUrlPool.length < this.maxPoolSize) {
            this.uploadUrlPool.push(urlData);
        }
    }

    /**
     * Get the public URL for a file (Native B2 format)
     * @param {string} key 
     * @returns {string}
     */
    getFileUrl(key) {
        // e.g. https://f005.backblazeb2.com/file/<bucketName>/<key>
        // We will assume downloadUrl is populated or fallback to a known structure if needed, 
        // but authorize() should have run.
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');

        if (this.downloadUrl) {
            return `${this.downloadUrl}/file/${Credentials.B2_BUCKET_NAME}/${encodedKey}`;
        }
        // Fallback or if not authorized yet
        const base = this.nativeDownloadUrl || "https://f005.backblazeb2.com";
        return `${base}/file/${Credentials.B2_BUCKET_NAME}/${encodedKey}`;
    }

    async upload(fileName, buffer) {
        let urlData = null;
        try {
            urlData = await this.getUploadUrl();

            const result = await this.b2.uploadFile({
                uploadUrl: urlData.uploadUrl,
                uploadAuthToken: urlData.authorizationToken,
                fileName,
                data: buffer
            });

            // If successful, return the URL to the pool
            this.uploadUrlPool.push(urlData);
            return result.data;
        } catch (err) {
            // If upload fails, we do NOT return the URL to the pool as it might be bad/expired.

            // Simple retry for 401 (Unauthorized) or specific B2 errors if needed
            if (err.response && err.response.status === 401) {
                logger.warn(`B2 Upload 401, retrying with fresh URL: ${fileName}`);

                // Try one more time with a fresh URL
                const freshUrlData = await this.b2.getUploadUrl({ bucketId: Credentials.B2_BUCKET_ID });

                const retryResult = await this.b2.uploadFile({
                    uploadUrl: freshUrlData.data.uploadUrl,
                    uploadAuthToken: freshUrlData.data.authorizationToken,
                    fileName,
                    data: buffer
                });

                // If retry works, pool this new valid URL
                this.uploadUrlPool.push({
                    uploadUrl: freshUrlData.data.uploadUrl,
                    authorizationToken: freshUrlData.data.authorizationToken
                });
                return retryResult.data;
            }

            throw err;
        }
    }

    async listFileNames(prefix, maxFileCount = 1000) {
        await this.authorize();
        try {
            const response = await this.b2.listFileNames({
                bucketId: Credentials.B2_BUCKET_ID,
                prefix: prefix,
                maxFileCount: maxFileCount,
            });
            return response.data.files;
        } catch (err) {
            logger.error(`B2 List Error: ${err.message}`);
            throw err;
        }
    }

    async downloadFileByName(fileName) {
        const startTime = Date.now();
        await this.authorize();
        logger.info(`authorized in ${Date.now() - startTime}ms for ${fileName}`);
        try {
            const downloadStartTime = Date.now();
            const response = await this.b2.downloadFileByName({
                bucketName: Credentials.B2_BUCKET_NAME,
                fileName: fileName,
                responseType: 'arraybuffer'
            });
            logger.info(`get response in ${Date.now() - downloadStartTime}ms for ${fileName}`);

            return response.data;
        } catch (err) {
            logger.error(`B2 Download Error for ${fileName}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Stream a file from B2 without loading it into memory
     * This is memory-efficient for creating zip files
     * @param {string} fileName - The file path in B2
     * @returns {Promise<NodeJS.ReadableStream>} - A readable stream
     */
    async downloadFileStream(fileName) {
        await this.authorize();
        try {
            const response = await this.b2.downloadFileByName({
                bucketName: Credentials.B2_BUCKET_NAME,
                fileName: fileName,
                responseType: 'stream'
            });
            return response.data;
        } catch (err) {
            if (err.response && err.response.status === 401) {
                logger.warn(`B2 Stream 401 for ${fileName}, re-authorizing and retrying...`);
                this.authPromise = null;
                this.authorizedAt = null;
                this.tokenCache.clear();
                await this.authorize();
                const retry = await this.b2.downloadFileByName({
                    bucketName: Credentials.B2_BUCKET_NAME,
                    fileName: fileName,
                    responseType: 'stream'
                });
                return retry.data;
            }
            logger.error(`B2 Stream Download Error for ${fileName}: ${err.message}`);
            throw err;
        }
    }

    async downloadFileRange(fileName, startByte, endByte) {
        await this.authorize();
        try {
            const response = await this.b2.downloadFileByName({
                bucketName: Credentials.B2_BUCKET_NAME,
                fileName: fileName,
                responseType: 'arraybuffer',
                axiosConfig: {
                    headers: {
                        'Range': `bytes=${startByte}-${endByte}`
                    }
                }
            });
            return response.data;
        } catch (err) {
            logger.error(`B2 Range Download Error for ${fileName}: ${err.message}`);
            throw err;
        }
    }

    async deleteFile(fileName) {
        await this.authorize();
        try {
            // To delete, we need fileId. List versions to find it.
            const versions = await this.b2.listFileVersions({
                bucketId: Credentials.B2_BUCKET_ID,
                startFileName: fileName,
                prefix: fileName
            });

            const files = versions.data.files.filter(f => f.fileName === fileName);

            if (files.length === 0) {
                logger.warn(`File not found in B2 for deletion: ${fileName}`);
                return false;
            }

            for (const file of files) {
                await this.b2.deleteFileVersion({
                    fileId: file.fileId,
                    fileName: file.fileName
                });
                logger.info(`Deleted B2 file version: ${file.fileName} (${file.fileId})`);
            }
            return true;
        } catch (err) {
            logger.error(`B2 Delete Error: ${err.message}`);
            throw err;
        }
    }
}

export default new B2Service();