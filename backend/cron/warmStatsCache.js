const cron = require('node-cron');
const User = require('../models/users.js');
const { computeUserStats } = require('../stats/aggregateUserStats.js');
const { setCached } = require('../redis/client.js');
const { info, error } = require('../utils/logger.js');

const CACHE_TTL_SECONDS = 5 * 60;

const warmStatsCache = async () => {
  const users = await User.find({}).select('_id').lean();
  info(`warmStatsCache: pre-warming stats cache for ${users.length} users`);

  for (const user of users) {
    const userId = user._id.toString();
    try {
      const stats = await computeUserStats(userId);
      if (stats) {
        await setCached(`stats:user:${userId}`, stats, CACHE_TTL_SECONDS);
      }
    } catch (err) {
      error(`warmStatsCache: failed for user ${userId}:`, err.message);
    }
  }

  info('warmStatsCache: done');
};

// '0 3 * * *' = minute 0, hour 3, every day of month, every month, every
// day of week -- i.e. once daily at 03:00 server time (off-peak).
const scheduleWarmStatsCache = () => {
  cron.schedule('0 3 * * *', () => {
    warmStatsCache().catch((err) => error('warmStatsCache crashed:', err));
  });
};

module.exports = { warmStatsCache, scheduleWarmStatsCache };
