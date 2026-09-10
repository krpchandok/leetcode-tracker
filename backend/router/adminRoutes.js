const router = require('express').Router();
const { warmStatsCache } = require('../cron/warmStatsCache.js');
const { pollLeetCodeSubmissions } = require('../cron/pollLeetCodeSubmissions.js');
const { retryFailedKafkaMessages } = require('../cron/retryFailedKafkaMessages.js');
const { error } = require('../utils/logger.js');

// These endpoints exist so an external scheduler (a GitHub Actions cron
// workflow — see .github/workflows/scheduled-tasks.yml) can trigger the
// same work cron/index.js's node-cron jobs do in the self-hosted
// docker-compose setup, but over HTTP. That's needed because Render's free
// Web Service tier spins down when idle and has no free always-on process
// to run node-cron in — an external caller both triggers the job and, as a
// side effect, wakes the service back up. A shared-secret header is enough
// here: these routes do nothing a logged-in user's own data can't already
// trigger indirectly, and there's no session for a scheduler to hold.
const requireAdminToken = (req, res, next) => {
  const configured = process.env.ADMIN_TASK_TOKEN;
  if (!configured) {
    return res.status(503).json({ error: 'ADMIN_TASK_TOKEN not configured on server' });
  }
  if (req.get('X-Admin-Token') !== configured) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
};

router.post('/warm-stats-cache', requireAdminToken, async (req, res) => {
  try {
    await warmStatsCache();
    res.json({ ok: true });
  } catch (err) {
    error('admin warm-stats-cache failed:', err);
    res.status(500).json({ error: 'warm-stats-cache failed' });
  }
});

router.post('/poll-leetcode-submissions', requireAdminToken, async (req, res) => {
  try {
    await pollLeetCodeSubmissions();
    res.json({ ok: true });
  } catch (err) {
    error('admin poll-leetcode-submissions failed:', err);
    res.status(500).json({ error: 'poll-leetcode-submissions failed' });
  }
});

router.post('/retry-failed-kafka-messages', requireAdminToken, async (req, res) => {
  try {
    const result = await retryFailedKafkaMessages();
    res.json({ ok: true, ...result });
  } catch (err) {
    error('admin retry-failed-kafka-messages failed:', err);
    res.status(500).json({ error: 'retry-failed-kafka-messages failed' });
  }
});

module.exports = router;
