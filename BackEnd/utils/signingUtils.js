import b2 from "../services/b2.service.js";

/**
 * Signs a list of media file objects for a specific order.
 * @param {string} orderId - The ID of the order.
 * @param {Array} files - The array of file objects to sign.
 * @returns {Promise<Array>} - The array of signed file objects.
 */
export const signOrderFiles = async (orderId, files) => {
    if (!files || files.length === 0) return files;
    const prefix = `orders/${orderId}/`;
    const tokenData = await b2.getFolderToken(prefix);
    if (!tokenData) return files;
    const { baseDownloadUrl, authorizationToken, bucketName } = tokenData;
    const sign = (filename) => `${baseDownloadUrl}/file/${bucketName}/orders/${orderId}/${filename}?Authorization=${authorizationToken}`;

    return files.map(f => {
        const newF = (typeof f.toObject === 'function') ? f.toObject() : { ...f };
        if (newF.filename) newF.url = sign(newF.filename);
        if (newF.thumbnailFilename) newF.thumbnail = sign(newF.thumbnailFilename);
        return newF;
    });
};

/**
 * Signs an entire order object's media and background.
 * @param {Object} orderOrDoc - The order object or Mongoose document.
 * @param {Object} [sharedTokenData] - Optional pre-fetched token data.
 * @returns {Promise<Object>} - The signed order object.
 */
export const signOrderMedia = async (orderOrDoc, sharedTokenData = null) => {
    if (!orderOrDoc) return orderOrDoc;
    const order = (typeof orderOrDoc.toObject === 'function') ? orderOrDoc.toObject() : orderOrDoc;
    const orderId = order._id.toString();
    
    let tokenData = sharedTokenData;
    if (!tokenData) {
        const prefix = `orders/${orderId}/`; 
        tokenData = await b2.getFolderToken(prefix);
    }
    
    if (!tokenData) return order;

    const { baseDownloadUrl, authorizationToken, bucketName } = tokenData;
    const sign = (filename) => `${baseDownloadUrl}/file/${bucketName}/orders/${orderId}/${filename}?Authorization=${authorizationToken}`;

    if (order.media && order.media.length > 0) {
        order.media = order.media.map(m => {
            const newM = { ...m };
            if (newM.filename) newM.url = sign(newM.filename);
            if (newM.thumbnailFilename) newM.thumbnail = sign(newM.thumbnailFilename);
            return newM;
        });
    }
    if (order.orderBackground && order.orderBackground.filename) {
        order.orderBackground.image = sign(order.orderBackground.filename);
    }
    return order;
};
