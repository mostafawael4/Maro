const B2 =  require("backblaze-b2");

const { 
    B2_APPLICATION_KEY_ID, 
    B2_APPLICATION_KEY, 
    B2_BUCKET_ID
} =  require ('../config/Credentials.js');

const logger = require('../utils/logger.js');


class B2Service {
    constructor(keyId, key) {
      this.b2 = new B2({ applicationKeyId: keyId, applicationKey: key });
      this.authenticated = false;
    }
  
    async authorize() {
      if (!this.authenticated) {
        await this.b2.authorize();
        this.authenticated = true;
      }
    }
  
    async upload(fileName, buffer) {
      await this.authorize();
      const uploadUrl = await this.b2.getUploadUrl({ bucketId: B2_BUCKET_ID });
  
      const result = await this.b2.uploadFile({
        uploadUrl: uploadUrl.data.uploadUrl,
        uploadAuthToken: uploadUrl.data.authorizationToken,
        fileName,
        data: buffer
      });
  
      return result.data;
    }
}
  
module.exports = new B2Service(B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY);