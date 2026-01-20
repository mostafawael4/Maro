import B2 from "backblaze-b2";

import * as Credentials from  '../config/Credentials.js';

import logger from '../utils/logger.js';


class B2Service {
    constructor(keyId, key) {
      this.b2 = new B2({ applicationKeyId: Credentials.B2_APPLICATION_KEY_ID, applicationKey: Credentials.B2_APPLICATION_KEY });
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
      const uploadUrl = await this.b2.getUploadUrl({ bucketId: Credentials.B2_BUCKET_ID });
  
      const result = await this.b2.uploadFile({
        uploadUrl: uploadUrl.data.uploadUrl,
        uploadAuthToken: uploadUrl.data.authorizationToken,
        fileName,
        data: buffer
      });
  
      return result.data;
    }
}
  
export default new B2Service(Credentials.B2_APPLICATION_KEY_ID, Credentials.B2_APPLICATION_KEY);