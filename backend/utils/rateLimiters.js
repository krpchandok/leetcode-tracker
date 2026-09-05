const rateLimit = require('express-rate-limit');

// These only apply to Express routes. backend/kafka/syncConsumer.js and
// backend/kafka/schedulingConsumer.js run as separate standalone processes
// that never go through Express, so none of these limiters touch them.

const jsonRateLimitHandler = (req, res) => {
  res.status(429).json({ error: 'too many requests, please try again later' });
};

// Strict: slows down credential-guessing/brute-force attempts against login
// and registration.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

// Looser: general protection for normal API traffic.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

// Routes behind this one (daily, profile, sync-problems, problems,
// test-auth, submissions/sync) each make an outbound call to LeetCode's own
// API, so hammering them risks LeetCode rate-limiting or flagging our
// server's IP, not just overloading our own server.
const leetcodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});

module.exports = { authLimiter, apiLimiter, leetcodeLimiter };
