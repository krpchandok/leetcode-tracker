// Standalone script — not a route. Run manually: node scripts/seedDemoAccount.js
// (or `npm run seed:demo`). Requires SEED_DEMO_PASSWORD in the environment
// and at least a handful of Problem documents already synced (see
// backend/leetcode/syncProblems.js) to build realistic Question/Review
// data from.

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');
const User = require('../models/users.js');
const Question = require('../models/question.js');
const Problem = require('../models/problem.js');
const Review = require('../models/review.js');

const DEMO_USERNAME = 'demo';
const TARGET_PROBLEM_COUNT = 50;
const WEAK_TAG_CANDIDATES = ['Dynamic Programming', 'Backtracking', 'Graph', 'Trie', 'Bit Manipulation'];
const WEAK_SOLVE_RATE = 0.3;
const STRONG_SOLVE_RATE = 0.9;
const DAYS_SPAN = 60;
const REVIEW_FRACTION = 0.6;
const FORCED_OVERDUE_COUNT = 5;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const pickRandom = (array, count) => [...array].sort(() => Math.random() - 0.5).slice(0, count);

// Only removes Question/Review documents this script itself created for the
// demo user in a previous run — if a Question happens to also be referenced
// by some other (real) user's `questions` array, it's unlinked, never
// deleted, so re-running this script can't corrupt anyone else's data.
const cleanupPreviousDemoData = async (demoUser) => {
  const oldQuestionIds = demoUser.questions || [];

  for (const questionId of oldQuestionIds) {
    const referencedElsewhere = await User.exists({
      _id: { $ne: demoUser._id },
      questions: questionId,
    });

    if (!referencedElsewhere) {
      await Question.findByIdAndDelete(questionId);
      await Review.deleteMany({ questionId });
    }
  }

  demoUser.questions = [];
  await demoUser.save();
};

const selectWeakTags = (allTags) => {
  const matched = WEAK_TAG_CANDIDATES.filter((tag) => allTags.has(tag));
  if (matched.length > 0) {
    return matched.slice(0, 2);
  }
  // No familiar "hard" tag present in this Problem catalog — fall back to
  // whichever tags exist at all, so there's still a concentrated weak spot.
  return [...allTags].slice(0, 2);
};

const main = async () => {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    throw new Error('SEED_DEMO_PASSWORD env var is required to seed the demo account');
  }

  await mongoose.connect(MONGODB_URI);
  info('seedDemoAccount connected to MongoDB');

  const passwordHash = await bcrypt.hash(password, 10);

  let demoUser = await User.findOne({ username: DEMO_USERNAME });
  if (!demoUser) {
    demoUser = new User({
      username: DEMO_USERNAME,
      passwordHash,
      leetcodeUsername: DEMO_USERNAME,
      questions: [],
    });
    await demoUser.save();
    info('Created new demo user');
  } else {
    info('Found existing demo user, resetting previously seeded data');
    await cleanupPreviousDemoData(demoUser);
    demoUser.passwordHash = passwordHash;
    demoUser.leetcodeUsername = DEMO_USERNAME;
  }

  const freeProblems = await Problem.find({ isPaidOnly: false });
  if (freeProblems.length < 10) {
    throw new Error(
      `Only ${freeProblems.length} free Problem documents found — run the sync-problems ` +
        'pipeline first (POST /api/leetcode/sync-problems) so there is real data to seed from.'
    );
  }

  const allTags = new Set();
  freeProblems.forEach((problem) => problem.topicTags.forEach((tag) => allTags.add(tag)));
  const weakTags = selectWeakTags(allTags);
  info(`Using ${JSON.stringify(weakTags)} as the deliberately weak tag(s) for this demo account`);

  const isWeakProblem = (problem) => problem.topicTags.some((tag) => weakTags.includes(tag));
  const weakProblems = freeProblems.filter(isWeakProblem);
  const otherProblems = freeProblems.filter((problem) => !isWeakProblem(problem));

  const weakCount = Math.min(weakProblems.length, 12);
  const otherCount = Math.min(otherProblems.length, TARGET_PROBLEM_COUNT - weakCount);
  const selected = [...pickRandom(weakProblems, weakCount), ...pickRandom(otherProblems, otherCount)];

  const representedTags = new Set();
  selected.forEach((problem) => problem.topicTags.forEach((tag) => representedTags.add(tag)));
  info(`Selected ${selected.length} problems across ${representedTags.size} tags`);

  const newQuestionIds = [];
  const reviewCandidates = [];

  for (const problem of selected) {
    const solveRate = isWeakProblem(problem) ? WEAK_SOLVE_RATE : STRONG_SOLVE_RATE;
    const solved = Math.random() < solveRate;
    const lastUpdated = daysAgo(randomInt(0, DAYS_SPAN));

    const question = await Question.create({
      questionNumber: problem.questionId,
      questionName: problem.title,
      questionLink: `https://leetcode.com/problems/${problem.titleSlug}/`,
      titleSlug: problem.titleSlug,
      topicTags: problem.topicTags,
      difficulty: problem.difficulty,
      status: solved ? 'solved' : 'unsolved',
      lastUpdated,
    });

    newQuestionIds.push(question._id);

    if (solved && Math.random() < REVIEW_FRACTION) {
      reviewCandidates.push({ question, lastUpdated });
    }
  }

  demoUser.questions = newQuestionIds;
  await demoUser.save();

  let overdueCount = 0;
  for (let i = 0; i < reviewCandidates.length; i += 1) {
    const { question, lastUpdated } = reviewCandidates[i];

    const repetitions = randomInt(0, 5);
    const easeFactor = Math.round(randomFloat(1.6, 2.9) * 100) / 100;
    const intervalDays = repetitions === 0 ? 1 : randomInt(repetitions, repetitions * 8);

    // Force the first few to be overdue so reviews-due is never empty by
    // sheer bad luck, then randomize the rest for a realistic mix.
    const isOverdue = i < FORCED_OVERDUE_COUNT || Math.random() < 0.3;
    const nextReviewDate = isOverdue ? daysAgo(randomInt(1, 10)) : daysFromNow(randomInt(1, intervalDays));
    if (isOverdue) {
      overdueCount += 1;
    }

    await Review.create({
      questionId: question._id,
      userId: demoUser._id,
      easeFactor,
      repetitions,
      intervalDays,
      nextReviewDate,
      lastReviewedDate: lastUpdated,
    });
  }

  info(
    `Seeded demo account: ${newQuestionIds.length} questions, ${reviewCandidates.length} reviews ` +
      `(${overdueCount} overdue), weak tags = ${JSON.stringify(weakTags)}`
  );

  await mongoose.disconnect();
};

main().catch((err) => {
  error('seedDemoAccount failed:', err);
  process.exit(1);
});
