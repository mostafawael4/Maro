import express from 'express';
import axios from 'axios';

const router = express.Router();

// Cache for exchange rate (5 minutes)
let cachedRate = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// Cache for geo detection per IP (60 seconds — short enough for VPN/location testing)
const geoCache = new Map();
const GEO_CACHE_DURATION = 60 * 1000;

/**
 * Determine currency from country code.
 * Egypt → EGP, UAE → AED, Others → USD
 */
const currencyFromCountry = (countryCode) => {
  if (!countryCode) return { currency: 'EGP', country: 'UNKNOWN' };
  const code = countryCode.toUpperCase();
  if (code === 'EG') return { currency: 'EGP', country: 'EG' };
  if (code === 'AE') return { currency: 'AED', country: 'AE' };
  return { currency: 'USD', country: code };
};

/**
 * GET /currency/detect
 * Server-side geo detection using the real client IP.
 * Railway sets req.ip correctly because trust proxy: true is enabled.
 * Returns { currency: 'EGP'|'AED'|'USD', country: 'EG'|'AE'|... }
 */
router.get('/detect', async (req, res) => {
  // Always forbid browser / CDN caching so VPN switches are seen immediately
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  // req.ip is the real client IP when trust proxy: true is set
  const clientIp = req.ip || req.connection?.remoteAddress || '';

  // Strip IPv6 loopback prefix
  const cleanIp = clientIp.replace(/^::ffff:/, '');

  // Determine if we should detect by calling API without IP (for local dev + VPN testing)
  const isLocal = !cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.');

  // For local IPs we skip the geoCache completely.
  // The 'local' path calls ipapi.co without an IP arg so it follows whichever
  // VPN (or raw ISP) the machine is using — caching '127.0.0.1' would mask
  // rapid VPN switches that the developer is trying to test.
  if (!isLocal) {
    const cached = geoCache.get(cleanIp);
    if (cached && (Date.now() - cached.ts < GEO_CACHE_DURATION)) {
      return res.json({ currency: cached.currency, country: cached.country });
    }
  }

  // Use empty string for ipapi.co to detect calling machine's outer IP if local
  const checkIp = isLocal ? '' : `${cleanIp}/`;

  try {
    const response = await axios.get(`https://ipapi.co/${checkIp}json/`, { timeout: 5000 });
    const data = response.data;
    if (data && data.country_code) {
      const result = currencyFromCountry(data.country_code);
      if (!isLocal) geoCache.set(cleanIp, { ...result, ts: Date.now() });
      return res.json(result);
    }
    throw new Error('No country_code in response');
  } catch (err) {
    // Fallback: try ip-api.com
    try {
      console.warn(`[GeoDetect] ipapi.co failed for ${cleanIp}, trying ip-api.com: ${err.message}`);
      // For ip-api.com, empty query detects calling machine
      const ipQuery = isLocal ? '' : cleanIp;
      const fallback = await axios.get(`http://ip-api.com/json/${ipQuery}?fields=countryCode`, { timeout: 5000 });
      const code = fallback.data?.countryCode;
      if (code) {
        const result = currencyFromCountry(code);
        if (!isLocal) geoCache.set(cleanIp, { ...result, ts: Date.now() });
        return res.json(result);
      }
    } catch (fallbackErr) {
      console.warn(`[GeoDetect] ip-api.com also failed: ${fallbackErr.message}`);
    }

    // Hard fallback: default to EGP (primary market)
    console.error(`[GeoDetect] All geo APIs failed for IP ${cleanIp}. Defaulting to EGP.`);
    return res.json({ currency: 'EGP', country: 'UNKNOWN' });
  }
});

router.get('/exchange-rate', async (req, res) => {
  const now = Date.now();

  if (cachedRate && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json(cachedRate);
  }

  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 5000
    });

    cachedRate = response.data;
    lastFetchTime = now;

    res.json(cachedRate);
  } catch (error) {
    console.error('Error fetching exchange rate:', error.message);

    if (cachedRate) {
      return res.json(cachedRate);
    }

    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch exchange rate',
      message: error.message
    });
  }
});

/**
 * GET /currency/location
 * Legacy endpoint — now forwards the real client IP to ipapi.co.
 */
router.get('/location', async (req, res) => {
  const clientIp = (req.ip || '').replace(/^::ffff:/, '');
  const isLocal = !clientIp || clientIp === '127.0.0.1' || clientIp === '::1';
  const ipParam = isLocal ? '' : `${clientIp}/`;
  try {
    const response = await axios.get(`https://ipapi.co/${ipParam}json/`, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    try {
      console.warn('ipapi.co failed, trying ip-api.com');
      const ipQuery = isLocal ? '' : clientIp;
      const response = await axios.get(`http://ip-api.com/json/${ipQuery}`, { timeout: 5000 });
      res.json(response.data);
    } catch (fallbackError) {
      console.error('Error fetching location:', fallbackError.message);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  }
});

export default router;

