const { Kafka, logLevel, Partitioners } = require('kafkajs');

// Local dev (docker-compose's Kafka broker): just a bare broker address,
// no auth. Managed Kafka (Upstash, Confluent Cloud, ...) needs SASL_SSL —
// set KAFKA_USERNAME/KAFKA_PASSWORD (and KAFKA_BROKER to the provider's
// broker URL) and this switches over automatically. mechanism: 'plain' is
// what Confluent Cloud's Basic/Standard clusters actually authenticate
// with (API key as username, secret as password) — confirmed by testing
// directly against a real cluster; SCRAM is a Dedicated-cluster feature.
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_USERNAME = process.env.KAFKA_USERNAME;
const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD;

// A single topic, not two. The original design used submissions.raw and
// submission.processed as separate topics, but on Confluent Cloud's free
// tier the API key created via the console's topic wizard is ACL-scoped to
// only the one topic it was created alongside — it can produce/consume
// there, but can't create new topics itself (verified directly: listing
// topics succeeds, creating one gets the connection closed by the broker).
// Rather than depend on a manual console step to create two more topics,
// the two logical event stages share this one topic and are told apart by
// a `stage` field on each message ('raw' vs 'processed') — see
// syncConsumer.js and schedulingConsumer.js, which each subscribe to this
// same topic under their own consumer group and filter out the stage
// that isn't theirs. KAFKA_TOPIC lets this be overridden without a code
// change if you ever provision a topic under a different name.
const TOPIC_LEETCODE_EVENTS = process.env.KAFKA_TOPIC || 'leetcode-solve-events';

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
  TOPIC_LEETCODE_EVENTS,
};
