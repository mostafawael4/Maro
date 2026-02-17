import b2 from "../services/b2.service.js";
import Credential from "../config/Credentials.js";

/**
 * Signs a list of media file objects for a specific order.
 * @param {string} orderId - The ID of the order.
 * @param {Array} files - The array of file objects to sign.
 * @returns {Promise<Array>} - The array of signed file objects.
 */
export const signOrderFiles = async (orderId, files) => {
    if (!files || files.length === 0) return files;

    const cdnUrl = Credential.OFFICIAL_CDN_URL;
    const bucketName = Credential.B2_BUCKET_NAME;

    const sign = (filename) => `${cdnUrl}/file/${bucketName}/orders/${orderId}/${encodeURIComponent(filename)}`;

    return files.map(f => {
        const newF = (typeof f.toObject === 'function') ? f.toObject() : { ...f };
        if (newF.filename) newF.url = sign(newF.filename);

        // Handle derived images
        const derived = ['thumbnail', 'medium', 'hero'];
        derived.forEach(field => {
            if (newF[field]) {
                // If it's a full URL, extract filename. If it's just a filename (legacy?), use it.
                // Assuming format .../filename.ext or just filename.ext
                const parts = newF[field].split('/');
                const filename = parts.pop();
                if (filename) newF[field] = sign(filename);
            }
        });

        // Legacy support for thumbnailFilename if thumbnail field wasn't populated differently?
        // In the new model, we populate 'thumbnail' with the full URL (which we just signed above)
        // If 'thumbnail' was empty but 'thumbnailFilename' existed (old video logic), we sign it.
        // But the loop above might have already handled 'thumbnail' if it held a URL.
        // Let's ensure if thumbnail is still null but thumbnailFilename exists, we sign it.
        if (!newF.thumbnail && newF.thumbnailFilename) {
            newF.thumbnail = sign(newF.thumbnailFilename);
        }

        return newF;
    });
};

/**
 * Signs an entire order object's media and background.
 * @param {Object} orderOrDoc - The order object or Mongoose document.
 * @param {Object} [sharedTokenData] - Optional pre-fetched token data (Legacy, ignored now).
 * @returns {Promise<Object>} - The signed order object.
 */
export const signOrderMedia = async (orderOrDoc, sharedTokenData = null) => {
    if (!orderOrDoc) return orderOrDoc;
    const order = (typeof orderOrDoc.toObject === 'function') ? orderOrDoc.toObject() : orderOrDoc;
    const orderId = order._id.toString();

    const cdnUrl = Credential.OFFICIAL_CDN_URL;
    const bucketName = Credential.B2_BUCKET_NAME;

    const sign = (filename) => `${cdnUrl}/file/${bucketName}/orders/${orderId}/${encodeURIComponent(filename)}`;

    if (order.media && order.media.length > 0) {
        order.media = order.media.map(m => {
            const newM = { ...m };
            if (newM.filename) newM.url = sign(newM.filename);

            // Handle derived images
            const derived = ['thumbnail', 'medium', 'hero'];
            derived.forEach(field => {
                if (newM[field]) {
                    const parts = newM[field].split('/');
                    const filename = parts.pop();
                    if (filename) newM[field] = sign(filename);
                }
            });

            if (!newM.thumbnail && newM.thumbnailFilename) {
                newM.thumbnail = sign(newM.thumbnailFilename);
            }
            return newM;
        });
    }
    if (order.orderBackground && order.orderBackground.filename) {
        order.orderBackground.image = sign(order.orderBackground.filename);
    }
    return order;
};
