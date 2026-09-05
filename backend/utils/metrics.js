const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const syncRequestsTotal = new client.Counter({
  name: 'leetcode_sync_requests_total',
  help: 'Total number of POST /api/leetcode/submissions/sync requests, by outcome',
  labelNames: ['outcome'],
  registers: [register],
});

const syncDurationSeconds = new client.Histogram({
  name: 'leetcode_sync_duration_seconds',
  help: 'Duration of the POST /api/leetcode/submissions/sync HTTP request/response cycle, in seconds (excludes async Kafka processing after the response is sent)',
  registers: [register],
});

const kafkaMessagesProcessedTotal = new client.Counter({
  name: 'kafka_messages_processed_total',
  help: 'Total number of Kafka messages processed, by consumer and outcome',
  labelNames: ['consumer', 'outcome'],
  registers: [register],
});

module.exports = {
  register,
  syncRequestsTotal,
  syncDurationSeconds,
  kafkaMessagesProcessedTotal,
};
