const Redis = require('ioredis');
const { error } = require('../utils/logger.js');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// enableOfflineQueue: false makes commands reject immediately when Redis is
// unreachable instead of queueing and hanging, so getCached/setCached/
// invalidate can fail fast and be treated as a cache miss below.
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  error('Redis client error:', err.message);
});

const getCached = async (key) => {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    error(`getCached(${key}) failed, treating as cache miss:`, err.message);
    return null;
  }
};

const setCached = async (key, value, ttlSeconds) => {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    error(`setCached(${key}) failed:`, err.message);
  }
};

const invalidate = async (key) => {
  try {
    await redis.del(key);
  } catch (err) {
    error(`invalidate(${key}) failed:`, err.message);
  }
};

module.exports = { redis, getCached, setCached, invalidate };
