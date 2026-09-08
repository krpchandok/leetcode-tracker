const router = require('express').Router();
const { queryLeetCode } = require('../leetcode/client.js');
const { syncProblems } = require('../leetcode/syncProblems.js');
const Problem = require('../models/problem.js');
const { getProducer, TOPIC_SUBMISSIONS_RAW } = require('../kafka/client.js');
const { tokenExtractor, userExtractor } = require('../utils/middleware.js');
const { syncRequestsTotal, syncDurationSeconds } = require('../utils/metrics.js');

router.get('/daily', async (req, res) => {
  const { data } = await queryLeetCode('question-of-today.graphql');
  res.json(data.activeDailyCodingChallengeQuestion);
});

router.get('/profile/:username', async (req, res) => {
  const { data } = await queryLeetCode('user-profile.graphql', { username: req.params.username });
  if (!data.matchedUser) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json(data.matchedUser.submitStats);
});

router.post('/sync-problems', async (req, res) => {
  const summary = await syncProblems();
  res.json(summary);
});

router.get('/problems', async (req, res) => {
  const { difficulty, topicTag, limit = 20, skip = 0 } = req.query;

  const filter = {};
  if (difficulty) {
    filter.difficulty = difficulty;
  }
  if (topicTag) {
    filter.topicTags = topicTag;
  }

  const total = await Problem.countDocuments(filter);
  const problems = await Problem.find(filter)
    .sort({ questionId: 1 })
    .skip(Number(skip))
    .limit(Number(limit));

  res.json({ total, limit: Number(limit), skip: Number(skip), problems });
});

// Manual entry: the in-app "Log a solve" form, replacing the Chrome
// extension entirely. Publishes to the exact same Kafka topic the
// (now-removed) extension-driven sync and the recentAcSubmissionList
// poller (backend/cron/pollLeetCodeSubmissions.js) both use — the
// ingestion → sync-service → scheduling-service pipeline doesn't care
// where a submission event originated, only that userId/titleSlug/
// statusDisplay are present. A manual log is always a solve by
// definition (you don't log ones you didn't solve), and additionally
// carries the difficulty/tags/time/notes detail LeetCode's own API never
// gives us for a submission — syncConsumer.js uses these to fill in a
// Question document more completely than the Kafka-sourced path can.
router.post('/submissions/log', tokenExtractor, userExtractor, async (req, res) => {
  const endTimer = syncDurationSeconds.startTimer();
  const userId = req.user._id.toString();

  try {
    const { titleSlug, title, difficulty, tags, timeTakenMinutes, notes } = req.body;

    if (!titleSlug || !title) {
      syncRequestsTotal.inc({ outcome: 'error' });
      endTimer();
      return res.status(400).json({ error: 'titleSlug and title are required' });
    }

    const producer = await getProducer();
    await producer.send({
      topic: TOPIC_SUBMISSIONS_RAW,
      messages: [
        {
          value: JSON.stringify({
            userId,
            titleSlug,
            title,
            statusDisplay: 'Accepted',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            difficulty: difficulty || undefined,
            tags: Array.isArray(tags) ? tags : undefined,
            timeTakenMinutes: typeof timeTakenMinutes === 'number' ? timeTakenMinutes : undefined,
            notes: notes || undefined,
            traceId: req.traceId,
          }),
        },
      ],
    });

    req.log.info({ userId, titleSlug }, 'submissions/log published');
    syncRequestsTotal.inc({ outcome: 'success' });
    endTimer();

    res.status(202).json({ published: true });
  } catch (err) {
    req.log.error({ err }, 'submissions/log failed');
    syncRequestsTotal.inc({ outcome: 'error' });
    endTimer();
    throw err;
  }
});

module.exports = router;
