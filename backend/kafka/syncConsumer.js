const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error, logger } = require('../utils/logger.js');
const {
  kafka,
  getProducer,
  TOPIC_SUBMISSIONS_RAW,
  TOPIC_SUBMISSION_PROCESSED,
} = require('./client.js');
const User = require('../models/users.js');
const Question = require('../models/question.js');
const { invalidate } = require('../redis/client.js');
const { kafkaMessagesProcessedTotal } = require('../utils/metrics.js');
const { startMetricsServer } = require('../utils/metricsServer.js');

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
  const { userId, titleSlug, title, statusDisplay, traceId, difficulty, tags, timeTakenMinutes, notes } =
    submission;
  const log = logger.child({ traceId });

  try {
    const user = await User.findById(userId);
    if (!user) {
      log.error({ userId, titleSlug }, 'syncConsumer: no user found, skipping');
      kafkaMessagesProcessedTotal.inc({ consumer: 'sync-service', outcome: 'error' });
      return;
    }

    const status = statusFor(statusDisplay);

    // difficulty/tags/timeTakenMinutes/notes only ever arrive from the
    // manual "Log a solve" form (backend/router/leetcodeRoutes.js) —
    // LeetCode's own submission data (whether from the sync-problems
    // pipeline or the recentAcSubmissionList poller) never carries them,
    // so they fall back to the same placeholders as before.
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
          difficulty: difficulty || 'Unknown',
          topicTags: tags || [],
        },
        $set: {
          status,
          ...(status === 'solved' ? { lastUpdated: new Date() } : {}),
          ...(typeof timeTakenMinutes === 'number' ? { timeTakenMinutes } : {}),
          ...(notes ? { notes } : {}),
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const alreadyLinked = user.questions.some((id) => id.toString() === question._id.toString());
    if (!alreadyLinked) {
      user.questions.push(question._id);
      await user.save();
    }

    log.info({ titleSlug, userId, status }, 'Processed submission');

    // Actively invalidate rather than waiting out the 5-minute TTL, so a user
    // who just solved something doesn't see stale dashboard numbers.
    await invalidate(`stats:user:${userId}`);

    await producer.send({
      topic: TOPIC_SUBMISSION_PROCESSED,
      messages: [
        {
          value: JSON.stringify({ userId, titleSlug, questionId: question._id.toString(), traceId }),
        },
      ],
    });

    kafkaMessagesProcessedTotal.inc({ consumer: 'sync-service', outcome: 'success' });
  } catch (err) {
    log.error({ err }, 'syncConsumer: failed to process submission');
    kafkaMessagesProcessedTotal.inc({ consumer: 'sync-service', outcome: 'error' });
    throw err;
  }
};

// Connects and starts consuming; assumes Mongo is already connected (or
// connecting — mongoose buffers commands until the connection is ready) and
// leaves metrics/process-lifecycle concerns to the caller. This is what
// app.js calls directly for the single-process Render deploy, where the
// Express app has already connected to Mongo and already exposes
// /api/metrics — starting a second Mongo connection or metrics server here
// would just be redundant in that mode.
const startSyncConsumer = async () => {
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

  return consumer;
};

// Standalone-process entry point — `npm run consumer:sync` / `node
// kafka/syncConsumer.js` in docker-compose's self-hosted setup, where this
// file has no Express app to share a Mongo connection or metrics registry
// with, so it sets both up itself. Guarded by require.main so `require`ing
// this module from app.js (the merged single-process Render deploy) only
// picks up startSyncConsumer/processSubmission and doesn't also try to open
// a second Mongo connection or bind a second metrics port.
if (require.main === module) {
  const runStandalone = async () => {
    await mongoose.connect(MONGODB_URI);
    info('syncConsumer connected to MongoDB');

    startMetricsServer(process.env.SYNC_METRICS_PORT || 9101);

    await startSyncConsumer();
  };

  runStandalone().catch((err) => {
    error('syncConsumer crashed:', err);
    process.exit(1);
  });
}

module.exports = { processSubmission, startSyncConsumer };
