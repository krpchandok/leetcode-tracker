// Optional alternative to manual "Log a solve" entry: for a User with a
// leetcodeUsername set, periodically checks LeetCode's public
// recentAcSubmissionList (no login/session required — a public profile
// query, same trust level as GET /api/leetcode/profile/:username) and
// publishes anything newly solved onto the same Kafka topic the manual
// form and syncProblems both feed. Removes any need for a browser
// extension to detect "Accepted" submissions.
const cron = require('node-cron');
const User = require('../models/users.js');
const Question = require('../models/question.js');
const { queryLeetCode } = require('../leetcode/client.js');
const { TOPIC_LEETCODE_EVENTS } = require('../kafka/client.js');
const { produceWithFallback } = require('../kafka/produceWithFallback.js');
const { info, error } = require('../utils/logger.js');

const POLL_LIMIT = 20;

const pollLeetCodeSubmissions = async () => {
  const users = await User.find({ leetcodeUsername: { $exists: true, $nin: [null, ''] } }).select(
    '_id leetcodeUsername questions'
  );
  info(`pollLeetCodeSubmissions: checking ${users.length} user(s) with a linked LeetCode username`);

  let totalPublished = 0;

  for (const user of users) {
    try {
      const { data } = await queryLeetCode('recent-ac-submissions.graphql', {
        username: user.leetcodeUsername,
        limit: POLL_LIMIT,
      });
      const submissions = data.recentAcSubmissionList || [];
      if (submissions.length === 0) {
        continue;
      }

      // Dedup against Questions this user already has marked solved,
      // rather than tracking a separate "last polled" cursor — simpler,
      // and self-healing if a poll run is ever missed or the job restarts.
      const solvedQuestions = await Question.find({
        _id: { $in: user.questions },
        status: 'solved',
      })
        .select('titleSlug')
        .lean();
      const alreadySolvedSlugs = new Set(solvedQuestions.map((q) => q.titleSlug));

      const newSubmissions = submissions.filter((s) => !alreadySolvedSlugs.has(s.titleSlug));
      if (newSubmissions.length === 0) {
        continue;
      }

      const { delivered } = await produceWithFallback(
        TOPIC_LEETCODE_EVENTS,
        newSubmissions.map((submission) => ({
          value: JSON.stringify({
            stage: 'raw',
            userId: user._id.toString(),
            titleSlug: submission.titleSlug,
            title: submission.title,
            statusDisplay: 'Accepted',
            timestamp: submission.timestamp,
            lang: submission.lang,
          }),
        }))
      );

      totalPublished += newSubmissions.length;
      info(
        `pollLeetCodeSubmissions: ${delivered ? 'published' : 'queued for retry'} ${newSubmissions.length} new submission(s) for ${user.leetcodeUsername}`
      );
    } catch (err) {
      error(`pollLeetCodeSubmissions: failed for ${user.leetcodeUsername}:`, err.message);
    }
  }

  info(`pollLeetCodeSubmissions: done, ${totalPublished} total submission(s) published`);
};

// '*/30 * * * *' = every 30 minutes.
const schedulePollLeetCodeSubmissions = () => {
  cron.schedule('*/30 * * * *', () => {
    pollLeetCodeSubmissions().catch((err) => error('pollLeetCodeSubmissions crashed:', err));
  });
};

module.exports = { pollLeetCodeSubmissions, schedulePollLeetCodeSubmissions };
