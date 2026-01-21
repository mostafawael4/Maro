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
      {
        corsRuleName: "allow-frontend-downloads",
        allowedOrigins: [
          "http://localhost:4200",
          "https://localhost:4200",
          "*" // Allows any origin to download using signed links. 
        ],
        allowedOperations: [
          "b2_download_file_by_id",
          "b2_download_file_by_name",
          "s3_get"
        ],
        allowedHeaders: ["range", "authorization", "content-type", "x-bz-content-sha1"],
        exposeHeaders: ["content-range", "x-bz-content-sha1", "content-length"],
        maxAgeSeconds: 3600,
      },
    ];

    await b2.updateBucket({
      bucketId: Credentials.B2_BUCKET_ID,
      bucketName: Credentials.B2_BUCKET_NAME,
      corsRules: corsRules,
    });

    console.log("✅ CORS rules updated successfully!");
    console.log("Origins allowed:", corsRules[0].allowedOrigins.join(", "));
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
