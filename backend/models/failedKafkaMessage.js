const mongoose = require('mongoose');

// A durable dead-letter queue for Kafka messages that couldn't be produced
// (broker unreachable, topic misconfigured, managed-Kafka outage, ...). See
// kafka/produceWithFallback.js for where these get written, and
// cron/retryFailedKafkaMessages.js for where they get drained back out.
const failedKafkaMessageSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
  },
  // The exact JSON string that would have been the Kafka message value —
  // stored as-is so retrying is just re-sending it verbatim, no
  // reconstruction logic to keep in sync with every producer call site.
  value: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  lastError: String,
}, { timestamps: true });

const FailedKafkaMessage = mongoose.model('FailedKafkaMessage', failedKafkaMessageSchema);
module.exports = FailedKafkaMessage;
