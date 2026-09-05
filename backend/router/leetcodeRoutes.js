const router = require('express').Router();
const { queryLeetCode } = require('../leetcode/client.js');
const { fetchCsrfToken } = require('../leetcode/credential.js');
const { syncProblems } = require('../leetcode/syncProblems.js');
const Problem = require('../models/problem.js');
const { getProducer, TOPIC_SUBMISSIONS_RAW } = require('../kafka/client.js');
const { tokenExtractor, userExtractor } = require('../utils/middleware.js');

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

// TEMPORARY manual-testing scaffolding for the authenticated-GraphQL pattern.
// Remove this route once the Chrome extension exists to supply a real user's
// session cookie per-request. It reads the developer's own throwaway
// LEETCODE_TEST_SESSION/LEETCODE_TEST_CSRF from backend/.env (never
// committed) — it must never ship to production and must never be wired up
// to accept a session/csrf pair from client input, since that would mean
// this server accepting and relaying an arbitrary user's live LeetCode
// credential.
router.get('/test-auth', async (req, res) => {
  const session = process.env.LEETCODE_TEST_SESSION;
  if (!session) {
    return res.status(500).json({ error: 'LEETCODE_TEST_SESSION not set in backend/.env' });
  }

  let csrf;
  try {
    csrf = await fetchCsrfToken();
  } catch (err) {
    csrf = process.env.LEETCODE_TEST_CSRF;
  }
  if (!csrf) {
    return res.status(500).json({ error: 'no csrf token available' });
  }

  const { data } = await queryLeetCode(
    'submissions.graphql',
    { offset: 0, limit: 20, lastKey: null, questionSlug: '' },
    { session, csrf }
  );
  res.json(data.submissionList);
});

// Real per-request credentials: the Chrome extension reads the user's own
// LEETCODE_SESSION/csrftoken cookies live from their browser and sends them
// here on each call. Nothing LeetCode-related is ever persisted server-side
// — session/csrf only ever live for the duration of this request.
router.post('/submissions/sync', tokenExtractor, userExtractor, async (req, res) => {
  const { session, csrf: bodyCsrf } = req.body;
  if (!session) {
    return res.status(400).json({ error: 'session is required' });
  }

  let csrf = bodyCsrf;
  if (!csrf) {
    try {
      csrf = await fetchCsrfToken();
    } catch (err) {
      return res.status(400).json({ error: 'csrf is required and could not be fetched' });
    }
  }

  const { data } = await queryLeetCode(
    'submissions.graphql',
    { offset: 0, limit: 20, lastKey: null, questionSlug: '' },
    { session, csrf }
  );

  const submissions = data.submissionList.submissions || [];
  const producer = await getProducer();
  const userId = req.user._id.toString();

  if (submissions.length > 0) {
    await producer.send({
      topic: TOPIC_SUBMISSIONS_RAW,
      messages: submissions.map((submission) => ({
        value: JSON.stringify({
          userId,
          titleSlug: submission.titleSlug,
          title: submission.title,
          statusDisplay: submission.statusDisplay,
          timestamp: submission.timestamp,
          lang: submission.lang,
        }),
      })),
    });
  }

  res.status(202).json({
    published: submissions.length,
    submissions: submissions.map((submission) => ({
      title: submission.title,
      titleSlug: submission.titleSlug,
      statusDisplay: submission.statusDisplay,
    })),
  });
});

module.exports = router;
