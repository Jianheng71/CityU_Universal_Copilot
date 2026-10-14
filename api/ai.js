const { handleAI } = require('../server/ai-handler');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestsByIP = new Map();

function isRateLimited(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const timestamps = (requestsByIP.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestsByIP.set(ip, timestamps);
    return true;
  }

  if (requestsByIP.size >= 5000) {
    for (const [address, requests] of requestsByIP) {
      if (requests.every((timestamp) => now - timestamp >= RATE_LIMIT_WINDOW_MS)) {
        requestsByIP.delete(address);
      }
    }
  }

  timestamps.push(now);
  requestsByIP.set(ip, timestamps);
  return false;
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const result = await handleAI(req.body);
  return res.status(result.status).json(result.body);
};
