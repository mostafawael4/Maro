import B2 from "backblaze-b2";
import Credentials from "../config/Credentials.js";

/**
 * This script updates the CORS rules for your Backblaze B2 bucket.
 * It is required to allow the frontend (Angular) to download files directly using 'fetch'.
 * 
 * To run this script:
 * node scripts/setup-b2-cors.js
 */
async function setupB2Cors() {
  const b2 = new B2({
    applicationKeyId: Credentials.B2_APPLICATION_KEY_ID,
    applicationKey: Credentials.B2_APPLICATION_KEY,
  });

  try {
    console.log("Authorizing with Backblaze B2...");
    await b2.authorize();

    console.log(`Updating CORS rules for bucket: ${Credentials.B2_BUCKET_NAME} (${Credentials.B2_BUCKET_ID})`);

    const corsRules = [
      // Rule 1: Uploads (Strict restriction)
      {
        corsRuleName: "allow-app-uploads",
        allowedOrigins: [
          "http://localhost:4200", 
        ], 
        allowedOperations: [
          "s3_put" // ONLY PUT allowed here
        ],
        allowedHeaders: [
          "content-type",
          "x-amz-server-side-encryption",
          "x-amz-meta-*" // Allow custom metadata if needed
        ],
        exposedHeaders: [],
        maxAgeSeconds: 3600,
      },
      // Rule 2: Downloads (Broader access for reading)
      {
        corsRuleName: "allow-app-downloads",
        allowedOrigins: [
          "http://localhost:4200"
        ],
        allowedOperations: [
          "s3_get",
          "s3_head"
        ],
        allowedHeaders: [
          "range",
          "authorization"
        ],
        exposeHeaders: [
          "content-range",
          "content-length",
          "x-amz-meta-*"
        ],
        maxAgeSeconds: 3600,
      }
    ];

    const response = await b2.updateBucket({
      bucketId: Credentials.B2_BUCKET_ID,
      bucketName: Credentials.B2_BUCKET_NAME,
      corsRules: corsRules,
    });

    console.log("✅ CORS rules updated successfully!");
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error("❌ Failed to update CORS rules:");
    if (error.response && error.response.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

setupB2Cors();
