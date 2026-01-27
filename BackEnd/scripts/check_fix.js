import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Credentials from '../config/Credentials.js';
import Order from '../models/order.js';

async function checkFix() {
    try {
        await connectDB(Credentials.MONGO_URI);
        
        console.log('Searching for unencoded URLs in Orders...');
        const orders = await Order.find({ 'media.url': /&/ });
        console.log(`Found ${orders.length} orders still having unencoded '&' in media URLs.`);

        if (orders.length > 0) {
            console.log('Sample of an unencoded URL:');
            const sample = orders[0].media.find(m => m.url.includes('&'));
            console.log(sample.url);
        } else {
            console.log('Verification: No unencoded URLs found in Orders.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkFix();
