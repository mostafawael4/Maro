import B2 from "backblaze-b2";

import Credentials from  '../config/Credentials.js';

import logger from '../utils/logger.js';


class B2Service {
    constructor(keyId, key) {
        this.b2 = new B2({ applicationKeyId: Credentials.B2_APPLICATION_KEY_ID, applicationKey: Credentials.B2_APPLICATION_KEY });
        this.authenticated = false;
    }
    
    async authorize() {
        if (!this.authenticated) {
          console.log(Credentials.B2_APPLICATION_KEY_ID, Credentials.B2_APPLICATION_KEY);
        await this.b2.authorize();
        this.authenticated = true;
      }
    }
  
  
    async upload(fileName, buffer) {
      await this.authorize();
      const uploadUrl = await this.b2.getUploadUrl({ bucketId: Credentials.B2_BUCKET_ID });
  
      const result = await this.b2.uploadFile({
        uploadUrl: uploadUrl.data.uploadUrl,
        uploadAuthToken: uploadUrl.data.authorizationToken,
        fileName,
        data: buffer
      });
  
      return result.data;
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
  
export default new B2Service(Credentials.B2_APPLICATION_KEY_ID, Credentials.B2_APPLICATION_KEY);