import express from 'express';
import axios from 'axios';

const router = express.Router();

// Cache for exchange rate (5 minutes)
let cachedRate = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; 

router.get('/exchange-rate', async (req, res) => {
  const now = Date.now();
  
  if (cachedRate && (now - lastFetchTime < CACHE_DURATION)) {
    return res.json(cachedRate);
  }

  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 5000 // 5 seconds timeout
    });
    
    cachedRate = response.data;
    lastFetchTime = now;
    
    res.json(cachedRate);
  } catch (error) {
    console.error('Error fetching exchange rate:', error.message);
    
    // If we have a cached rate, return it even if expired as fallback
    if (cachedRate) {
      return res.json(cachedRate);
    }
    
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch exchange rate',
      message: error.message 
    });
  }
});

router.get('/location', async (req, res) => {
  try {
    // Use the client's IP if possible, but these APIs usually detect it automatically from the request
    const response = await axios.get('https://ipapi.co/json/', {
      timeout: 5000
    });
    res.json(response.data);
  } catch (error) {
    try {
      console.warn('ipapi.co failed, trying ip-api.com');
      const response = await axios.get('https://ip-api.com/json/', {
        timeout: 5000
      });
      res.json(response.data);
    } catch (fallbackError) {
      console.error('Error fetching location:', fallbackError.message);
      res.status(500).json({ error: 'Failed to fetch location' });
    }
  }
});

export default router;
