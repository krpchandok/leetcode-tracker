const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');
const {
  kafka,
  getProducer,
  TOPIC_SUBMISSIONS_RAW,
  TOPIC_SUBMISSION_PROCESSED,
} = require('./client.js');
const User = require('../models/users.js');
const Question = require('../models/question.js');
const { invalidate } = require('../redis/client.js');

const IN_PROGRESS_STATUSES = new Set(['Pending', 'Judging', 'Compiling']);

const statusFor = (statusDisplay) => {
  if (statusDisplay === 'Accepted') {
    return 'solved';
  }
  if (IN_PROGRESS_STATUSES.has(statusDisplay)) {
    return 'in progress';
  }
  return 'unsolved';
};

const processSubmission = async (submission, producer) => {
  const { userId, titleSlug, title, statusDisplay } = submission;

  const user = await User.findById(userId);
  if (!user) {
    error(`syncConsumer: no user found for id ${userId}, skipping ${titleSlug}`);
    return;
  }

  const status = statusFor(statusDisplay);

  const question = await Question.findOneAndUpdate(
    { titleSlug },
    {
      $setOnInsert: {
        // LeetCode's numeric id isn't in the submission payload and the
        // Problem collection lookup to backfill it is a later step; -1
        // marks it as not yet known.
        questionNumber: -1,
        questionName: title,
        questionLink: `https://leetcode.com/problems/${titleSlug}/`,
        titleSlug,
        difficulty: 'Unknown',
      },
      $set: {
        status,
        ...(status === 'solved' ? { lastUpdated: new Date() } : {}),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const alreadyLinked = user.questions.some((id) => id.toString() === question._id.toString());
  if (!alreadyLinked) {
    user.questions.push(question._id);
    await user.save();
  }

  info(`Processed ${titleSlug} for user ${userId}: ${status}`);

  // Actively invalidate rather than waiting out the 5-minute TTL, so a user
  // who just solved something doesn't see stale dashboard numbers.
  await invalidate(`stats:user:${userId}`);

  await producer.send({
    topic: TOPIC_SUBMISSION_PROCESSED,
    messages: [
      {
        value: JSON.stringify({ userId, titleSlug, questionId: question._id.toString() }),
      },
    ],
  });
};

const run = async () => {
  await mongoose.connect(MONGODB_URI);
  info('syncConsumer connected to MongoDB');

  const producer = await getProducer();

  const consumer = kafka.consumer({ groupId: 'sync-service' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_SUBMISSIONS_RAW, fromBeginning: false });

  info(`syncConsumer subscribed to ${TOPIC_SUBMISSIONS_RAW}, waiting for messages...`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const submission = JSON.parse(message.value.toString());
      await processSubmission(submission, producer);
    },
  });
};

run().catch((err) => {
  error('syncConsumer crashed:', err);
  process.exit(1);
});
