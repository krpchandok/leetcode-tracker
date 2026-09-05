const { Kafka, logLevel, Partitioners } = require('kafkajs');

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

const TOPIC_SUBMISSIONS_RAW = 'submissions.raw';
const TOPIC_SUBMISSION_PROCESSED = 'submission.processed';

const kafka = new Kafka({
  clientId: 'leetcode-tracker',
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.WARN,
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
