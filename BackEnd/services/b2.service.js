import B2 from "backblaze-b2";

import Credentials from  '../config/Credentials.js';

import logger from '../utils/logger.js';


class B2Service {
    constructor() {
        this.b2 = new B2({ applicationKeyId: Credentials.B2_APPLICATION_KEY_ID, applicationKey: Credentials.B2_APPLICATION_KEY });
        this.authPromise = null;
        this.uploadUrlPool = [];
    }
    
    async authorize() {
        if (this.authPromise) return this.authPromise;
        
        if (!Credentials.B2_APPLICATION_KEY_ID || !Credentials.B2_APPLICATION_KEY) {
            logger.error("B2_APPLICATION_KEY_ID or B2_APPLICATION_KEY is missing in environment variables.");
            return Promise.reject(new Error("Missing B2 Credentials"));
        }

        this.authPromise = (async () => {
            try {
                logger.info(`B2: Authorizing with Key ID: ${Credentials.B2_APPLICATION_KEY_ID.substring(0, 8)}...`);
                const response = await this.b2.authorize();
                this.downloadUrl = response.data.downloadUrl;
                // Clear pool on re-auth as old tokens might be invalid
                this.uploadUrlPool = [];
                logger.info(`B2: Authorized successfully. Download URL: ${this.downloadUrl}`);
            } catch (err) {
                logger.error(`B2: Authorization failed: ${err.message}`);
                this.authPromise = null; // Reset on failure so we can retry
                throw err;
            }
        })();
        
        return this.authPromise;
    }

    async getPresignedUrl(key) {
        try {
            await this.authorize();
            if (!Credentials.B2_BUCKET_ID) throw new Error("B2_BUCKET_ID is missing");

             const response = await this.b2.getDownloadAuthorization({
                bucketId: Credentials.B2_BUCKET_ID,
                fileNamePrefix: key,
                validDurationInSeconds: 86400,
            });
            const authorizationToken = response.data.authorizationToken;
            return `${this.downloadUrl}/file/${Credentials.B2_BUCKET_NAME}/${key}?Authorization=${authorizationToken}`;
        } catch (err) {
             logger.error(`B2: Presign Error for ${key}: ${err.message}`);
             // Fallback to raw URL so at least something is returned, though it may be blocked by B2 privacy
             return `https://${Credentials.B2_BUCKET_NAME}.s3.us-east-005.backblazeb2.com/${key}`;
        }
    }

    async getFolderToken(prefix) {
        try {
            await this.authorize();
            if (!Credentials.B2_BUCKET_ID) throw new Error("B2_BUCKET_ID is missing");

             const response = await this.b2.getDownloadAuthorization({
                bucketId: Credentials.B2_BUCKET_ID,
                fileNamePrefix: prefix,
                validDurationInSeconds: 86400,
            });
            return {
                baseDownloadUrl: this.downloadUrl,
                authorizationToken: response.data.authorizationToken,
                bucketName: Credentials.B2_BUCKET_NAME
            };
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
            // Force re-auth might be needed if the account auth is bad, 
            // but usually 401 on uploadFile means the upload URL/token is expired.
            
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

    async listFileNames(prefix) {
        await this.authorize();
        try {
            const response = await this.b2.listFileNames({
                bucketId: Credentials.B2_BUCKET_ID,
                prefix: prefix,
                maxFileCount: 1000,
            });
            return response.data.files;
        } catch (err) {
            logger.error(`B2 List Error: ${err.message}`);
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