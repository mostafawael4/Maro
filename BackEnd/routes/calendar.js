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

        // Fetch all orders to match the website's calendar view
        const orders = await Order.find({}).lean();
        logger.info(`Generating calendar feed for ${orders.length} orders total.`);

        let ical = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Maro Weddings//Calendar Feed//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Maro Weddings',
            'X-WR-TIMEZONE:UTC',
            'X-PUBLISHED-TTL:PT1H', // Refresh every hour
            'REFRESH-INTERVAL;VALUE=DURATION:PT1H'
        ];

        let eventCount = 0;
        orders.forEach(order => {
            // Use same date logic as frontend: specific eventDate or fallback to createdAt
            const dateSource = order.orderForm?.eventDate || order.createdAt;
            if (!dateSource) return;

            const eventDate = new Date(dateSource);
            if (isNaN(eventDate.getTime())) return;

            eventCount++;
            const brideAndGroom = order.orderForm?.brideAndGroomNames || order.clientName || 'Wedding';
            const venue = order.orderForm?.eventVenue || 'No venue specified';
            const summary = `Wedding: ${brideAndGroom}`;

            const description = [
                `Status: ${order.status}`,
                `Client: ${order.clientName || 'N/A'}`,
                `Notes: ${order.notes || 'None'}`,
                `Link: https://maroweddings.com/orders/${order._id}`
            ].join('\\n');

            // Default event duration: 12 hours from the start date/time
            const dtStart = formatIcalDate(eventDate);
            const endDate = new Date(eventDate);
            endDate.setHours(endDate.getHours() + 12);
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

        logger.info(`Included ${eventCount} events in the iCal feed.`);
        ical.push('END:VCALENDAR');

        res.set({
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="calendar.ics"'
        });

        res.send(ical.join('\r\n'));
    } catch (error) {
        logger.error(`Error generating calendar feed: ${error.message}`);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
