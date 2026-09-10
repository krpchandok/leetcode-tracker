const cron = require('node-cron');
const FailedKafkaMessage = require('../models/failedKafkaMessage.js');
const { getProducer } = require('../kafka/client.js');
const { info, error } = require('../utils/logger.js');

// After this many failed attempts, a message is left in place (for
// inspection) but stops being retried automatically — a message that's
// failed 5 times running is more likely wrong than unlucky.
const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100;

const retryFailedKafkaMessages = async () => {
  const pending = await FailedKafkaMessage.find({ attempts: { $lt: MAX_ATTEMPTS } }).limit(BATCH_SIZE);
  if (pending.length === 0) {
    info('retryFailedKafkaMessages: nothing pending');
    return { retried: 0, succeeded: 0 };
  }

  const producer = await getProducer();
  let succeeded = 0;

  for (const doc of pending) {
    try {
      await producer.send({ topic: doc.topic, messages: [{ value: doc.value }] });
      await FailedKafkaMessage.deleteOne({ _id: doc._id });
      succeeded += 1;
    } catch (err) {
      doc.attempts += 1;
      doc.lastError = err.message;
      await doc.save();
      error(`retryFailedKafkaMessages: retry failed for message ${doc._id}:`, err.message);
    }
  }

  info(`retryFailedKafkaMessages: retried ${pending.length}, ${succeeded} succeeded`);
  return { retried: pending.length, succeeded };
};

// '*/10 * * * *' = every 10 minutes.
const scheduleRetryFailedKafkaMessages = () => {
  cron.schedule('*/10 * * * *', () => {
    retryFailedKafkaMessages().catch((err) => error('retryFailedKafkaMessages crashed:', err));
  });
};

module.exports = { retryFailedKafkaMessages, scheduleRetryFailedKafkaMessages };
