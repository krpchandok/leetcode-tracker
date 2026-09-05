const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');
const { scheduleWarmStatsCache } = require('./warmStatsCache.js');

const run = async () => {
  await mongoose.connect(MONGODB_URI);
  info('cron process connected to MongoDB');

  scheduleWarmStatsCache();
  info('cron process started, warmStatsCache scheduled for 03:00 daily');
};

run().catch((err) => {
  error('cron process crashed:', err);
  process.exit(1);
});
