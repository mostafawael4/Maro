import express from 'express';
import Order from '../models/order.js';
import logger from '../utils/logger.js';
import Credentials from '../config/Credentials.js';

const router = express.Router();

// Helper to escape iCal text
const escapeIcal = (str) => {
    if (!str) return '';
    return str.replace(/[\\,;]/g, (match) => `\\${match}`).replace(/\n/g, '\\n');
};

// Helper to format date for iCal (YYYYMMDDTHHmmSSZ)
const formatIcalDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

/**
 * GET /api/calendar/feed
 * Publicly accessible iCal feed with token-based security
 */
router.get('/feed', async (req, res) => {
    try {
        const { token } = req.query;
        const secret = process.env.CALENDAR_SECRET || 'maro-wedding-default-secret';

        // Simple security check
        if (token !== secret) {
            logger.warn(`Unauthorized calendar feed access attempt with token: ${token}`);
            return res.status(401).send('Unauthorized');
        }

        // Fetch orders with event dates
        const orders = await Order.find({ 'orderForm.eventDate': { $exists: true } }).lean();

        let ical = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Maro Weddings//Calendar Feed//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Maro Weddings Events',
            'X-WR-TIMEZONE:UTC'
        ];

        orders.forEach(order => {
            const eventDate = new Date(order.orderForm.eventDate);
            if (isNaN(eventDate.getTime())) return;

            const groomName = order.orderForm.brideAndGroomNames || order.clientName || 'Wedding';
            const venue = order.orderForm.eventVenue || '';
            const summary = `Wedding: ${groomName}`;
            const description = [
                `Status: ${order.status}`,
                `Client: ${order.clientName || 'N/A'}`,
                `Notes: ${order.notes || 'None'}`
            ].join('\\n');

            // Default event duration: 1 day if not specified
            const dtStart = formatIcalDate(eventDate);
            const endDate = new Date(eventDate);
            endDate.setHours(endDate.getHours() + 12); // Assume 12 hours if only date is provided
            const dtEnd = formatIcalDate(endDate);
            const now = formatIcalDate(new Date());

            ical.push('BEGIN:VEVENT');
            ical.push(`UID:${order._id}@maroweddings.com`);
            ical.push(`DTSTAMP:${now}`);
            ical.push(`DTSTART:${dtStart}`);
            ical.push(`DTEND:${dtEnd}`);
            ical.push(`SUMMARY:${escapeIcal(summary)}`);
            ical.push(`LOCATION:${escapeIcal(venue)}`);
            ical.push(`DESCRIPTION:${escapeIcal(description)}`);
            ical.push('END:VEVENT');
        });

        ical.push('END:VCALENDAR');

        res.set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="maro-calendar.ics"'
        });

        res.send(ical.join('\r\n'));
    } catch (error) {
        logger.error(`Error generating calendar feed: ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
