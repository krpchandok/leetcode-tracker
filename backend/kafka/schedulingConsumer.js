const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');
const { kafka, TOPIC_SUBMISSION_PROCESSED } = require('./client.js');
const Question = require('../models/question.js');
const Review = require('../models/review.js');
const { calculateNextReview } = require('../scheduling/sm2.js');

const DEFAULT_SM2_STATE = { easeFactor: 2.5, intervalDays: 1, repetitions: 0 };

// A LeetCode submission only tells us solved/not-solved, not a graded 0-5
// recall quality, so this is a simple stand-in until something richer exists.
const qualityFor = (questionStatus) => (questionStatus === 'solved' ? 4 : 2);

const processEvent = async (event) => {
  const { userId, titleSlug, questionId } = event;

  const question = await Question.findById(questionId);
  if (!question) {
    error(`schedulingConsumer: no question found for id ${questionId}, skipping ${titleSlug}`);
    return;
  }

  const quality = qualityFor(question.status);

  // find-or-create by the unique (questionId, userId) pair, then overwrite
  // with the freshly computed SM-2 state — safe to re-run for the same
  // document either way.
  let review = await Review.findOne({ questionId, userId });
  const priorState = review
    ? { easeFactor: review.easeFactor, intervalDays: review.intervalDays, repetitions: review.repetitions }
    : DEFAULT_SM2_STATE;

  const next = calculateNextReview(priorState, quality);

  if (!review) {
    review = new Review({ questionId, userId });
  }
  review.easeFactor = next.easeFactor;
  review.intervalDays = next.intervalDays;
  review.repetitions = next.repetitions;
  review.nextReviewDate = next.nextReviewDate;
  review.lastReviewedDate = new Date();

  await review.save();

  info(
    `Scheduled ${titleSlug} for review on ${next.nextReviewDate.toISOString()}, interval now ${next.intervalDays} days`
  );
};

const run = async () => {
  await mongoose.connect(MONGODB_URI);
  info('schedulingConsumer connected to MongoDB');

  // Redelivery note: this relies solely on kafkajs's default offset-commit
  // behavior (committed after eachMessage resolves) to avoid reprocessing.
  // If a message is redelivered anyway (e.g. the process crashes between
  // saving the Review and the offset commit), SM-2 state would advance an
  // extra step for that one event. No separate dedup (e.g. a
  // lastProcessedEventId) is implemented here — acceptable for this brief,
  // revisit if that turns out to matter in practice.
  const consumer = kafka.consumer({ groupId: 'scheduling-service' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_SUBMISSION_PROCESSED, fromBeginning: false });

  info(`schedulingConsumer subscribed to ${TOPIC_SUBMISSION_PROCESSED}, waiting for messages...`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      await processEvent(event);
    },
  });
};

run().catch((err) => {
  error('schedulingConsumer crashed:', err);
  process.exit(1);
});
