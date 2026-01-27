import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Credentials from '../config/Credentials.js';
import HomePage from '../models/HomePage.js';
import Film from '../models/Film.js';
import Gallery from '../models/Gallery.js';
import Order from '../models/order.js';
import b2 from '../services/b2.service.js';

async function fixUrls() {
    try {
        console.log('Connecting to database...');
        await connectDB(Credentials.MONGO_URI);
        console.log('Connected to database.');

        // Initialize B2 service (needs authorization to get download URL if not hardcoded)
        // Actually getFileUrl can fallback to native B2 URL if not authorized.
        // But better to authorize if possible.
        try {
            await b2.authorize();
        } catch (e) {
            console.warn('B2 authorization failed, using fallback URLs:', e.message);
        }

        // 1. Fix HomePage
        console.log('Fixing HomePage URLs...');
        const homePages = await HomePage.find({ filename: { $regex: '&' } });
        console.log(`Found ${homePages.length} HomePage items to fix.`);
        for (const hp of homePages) {
            const oldUrl = hp.url;
            hp.url = b2.getFileUrl(`homepage/${hp.filename}`);
            if (oldUrl !== hp.url) {
                console.log(`Updated HomePage: ${hp.filename}`);
                await hp.save();
            }
        }

        // 2. Fix Gallery
        console.log('Fixing Gallery URLs...');
        const galleries = await Gallery.find({ filename: { $regex: '&' } });
        console.log(`Found ${galleries.length} Gallery items to fix.`);
        for (const g of galleries) {
            const oldUrl = g.url;
            g.url = b2.getFileUrl(`gallery/${g.filename}`);
            if (oldUrl !== g.url) {
                console.log(`Updated Gallery: ${g.filename}`);
                await g.save();
            }
        }

        // 3. Fix Film
        console.log('Fixing Film URLs...');
        const films = await Film.find({ $or: [{ filename: { $regex: '&' } }, { thumbnailFilename: { $regex: '&' } }] });
        console.log(`Found ${films.length} Film items to fix.`);
        for (const f of films) {
            let modified = false;
            if (f.filename && f.filename.includes('&')) {
                const oldUrl = f.url;
                f.url = b2.getFileUrl(`films/${f.filename}`);
                if (oldUrl !== f.url) modified = true;
            }
            if (f.thumbnailFilename && f.thumbnailFilename.includes('&')) {
                const oldThumb = f.thumbnail;
                f.thumbnail = b2.getFileUrl(`films/${f.thumbnailFilename}`);
                if (oldThumb !== f.thumbnail) modified = true;
            }
            if (modified) {
                console.log(`Updated Film: ${f.filename}`);
                await f.save();
            }
        }

        // 4. Fix Order media
        console.log('Fixing Order media URLs...');
        const orders = await Order.find({ 
            $or: [
                { 'media.filename': /&/ },
                { 'media.thumbnailFilename': /&/ },
                { 'orderBackground.filename': /&/ }
            ] 
        });
        console.log(`Found ${orders.length} Orders with items to fix.`);
        for (const o of orders) {
            let modified = false;
            const orderId = o._id.toString();

            // Background
            if (o.orderBackground?.filename && o.orderBackground.filename.includes('&')) {
                o.orderBackground.image = b2.getFileUrl(`orders/${orderId}/${o.orderBackground.filename}`);
                modified = true;
            }

            // Media array
            if (o.media && o.media.length > 0) {
                for (const m of o.media) {
                    if (m.filename && m.filename.includes('&')) {
                        m.url = b2.getFileUrl(`orders/${orderId}/${m.filename}`);
                        modified = true;
                    }
                    if (m.thumbnailFilename && m.thumbnailFilename.includes('&')) {
                        m.thumbnail = b2.getFileUrl(`orders/${orderId}/${m.thumbnailFilename}`);
                        modified = true;
                    }
                }
            }

            if (modified) {
                console.log(`Updated Order ${orderId}: fixed ${o.media ? o.media.filter(m => m.filename && m.filename.includes('&')).length : 0} media items`);
                await o.save();
            }
        }

        console.log('Successfully updated all URLs with proper encoding.');
        process.exit(0);
    } catch (err) {
        console.error('Error during URL fix:', err);
        process.exit(1);
    }
}

fixUrls();
