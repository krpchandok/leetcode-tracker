const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');
const { scheduleWarmStatsCache } = require('./warmStatsCache.js');
const { schedulePollLeetCodeSubmissions } = require('./pollLeetCodeSubmissions.js');
const { scheduleRetryFailedKafkaMessages } = require('./retryFailedKafkaMessages.js');

const run = async () => {
  await mongoose.connect(MONGODB_URI);
  info('cron process connected to MongoDB');

  scheduleWarmStatsCache();
  schedulePollLeetCodeSubmissions();
  scheduleRetryFailedKafkaMessages();
  info(
    'cron process started: warmStatsCache at 03:00 daily, pollLeetCodeSubmissions every 30 minutes, retryFailedKafkaMessages every 10 minutes'
  );
};

run().catch((err) => {
  error('cron process crashed:', err);
  process.exit(1);
});
