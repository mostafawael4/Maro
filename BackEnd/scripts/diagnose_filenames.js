import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Credentials from '../config/Credentials.js';
import HomePage from '../models/HomePage.js';
import Film from '../models/Film.js';
import Gallery from '../models/Gallery.js';
import Order from '../models/order.js';

async function diagnose() {
    try {
        await connectDB(Credentials.MONGO_URI);
        
        console.log('--- HomePage filenames ---');
        const hps = await HomePage.find({}, 'filename');
        hps.forEach(h => console.log(h.filename));

        console.log('--- Gallery filenames ---');
        const gs = await Gallery.find({}, 'filename');
        gs.forEach(g => console.log(g.filename));

        console.log('--- Film filenames ---');
        const fs = await Film.find({}, 'filename thumbnailFilename');
        fs.forEach(f => {
            console.log('Video:', f.filename);
            if (f.thumbnailFilename) console.log('Thumb:', f.thumbnailFilename);
        });

        console.log('--- Order media filenames (first 10 orders) ---');
        const orders = await Order.find({}, 'media').limit(10);
        orders.forEach(o => {
            if (o.media) {
                o.media.forEach(m => console.log(m.filename));
            }
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
diagnose();
