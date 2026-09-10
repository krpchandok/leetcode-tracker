const { getProducer } = require('./client.js');
const FailedKafkaMessage = require('../models/failedKafkaMessage.js');
const { error: logError } = require('../utils/logger.js');

// Best-effort produce: on any failure — a misconfigured topic, an
// unreachable broker, a transient managed-Kafka outage — this logs the
// failure and persists the message to Mongo instead of throwing, so a
// Kafka problem degrades to "synced a little late" rather than a 500 in
// the middle of an HTTP request or a crashed cron run. Returns
// `{ delivered }` rather than throwing either way; callers decide what
// user-facing behavior that should mean.
//
// cron/retryFailedKafkaMessages.js drains this collection back through
// Kafka once it's healthy again (see .github/workflows/scheduled-tasks.yml
// for how that's triggered on a schedule).
const produceWithFallback = async (topic, messages) => {
  try {
    const producer = await getProducer();
    await producer.send({ topic, messages });
    return { delivered: true };
  } catch (err) {
    logError(`Kafka produce to "${topic}" failed, queuing ${messages.length} message(s) for retry:`, err.message);
    try {
      await FailedKafkaMessage.insertMany(
        messages.map((message) => ({ topic, value: message.value, lastError: err.message }))
      );
    } catch (persistErr) {
      // Both Kafka AND Mongo are unavailable — nothing left to fall back
      // to. Logged so it's visible, but still doesn't throw: the caller
      // already knows delivery failed via `delivered: false`.
      logError('produceWithFallback: failed to persist message for retry too:', persistErr.message);
    }
    return { delivered: false };
  }
};

module.exports = { produceWithFallback };
