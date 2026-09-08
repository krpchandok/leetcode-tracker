const { Kafka, logLevel, Partitioners } = require('kafkajs');

// Local dev (docker-compose's Kafka broker): just a bare broker address,
// no auth. Managed Kafka (Upstash, Confluent Cloud, ...) needs SASL_SSL —
// set KAFKA_USERNAME/KAFKA_PASSWORD (and KAFKA_BROKER to the provider's
// broker URL) and this switches over automatically. Confirmed against
// Upstash Kafka's own documented kafkajs example: SASL mechanism
// scram-sha-256, ssl: true, single broker URL.
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_USERNAME = process.env.KAFKA_USERNAME;
const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD;

const TOPIC_SUBMISSIONS_RAW = 'submissions.raw';
const TOPIC_SUBMISSION_PROCESSED = 'submission.processed';

const managedAuth =
  KAFKA_USERNAME && KAFKA_PASSWORD
    ? {
        ssl: true,
        sasl: {
          mechanism: 'plain',
          username: KAFKA_USERNAME,
          password: KAFKA_PASSWORD,
        },
      }
    : {};

const kafka = new Kafka({
  clientId: 'leetcode-tracker',
  brokers: KAFKA_BROKER.split(',').map((broker) => broker.trim()),
  logLevel: logLevel.WARN,
  ...managedAuth,
});

const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
let producerConnection = null;

const getProducer = async () => {
  if (!producerConnection) {
    producerConnection = producer.connect();
  }
  await producerConnection;
  return producer;
};

module.exports = {
  kafka,
  producer,
  getProducer,
  TOPIC_SUBMISSIONS_RAW,
  TOPIC_SUBMISSION_PROCESSED,
};
