const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/users.js');
const Question = require('../models/question.js');
const Review = require('../models/review.js');
const bcrypt = require('bcrypt');
const { tokenExtractor, userExtractor } = require('../utils/middleware.js');
const { authLimiter } = require('../utils/rateLimiters.js');
const { getCached, setCached } = require('../redis/client.js');
const { computeUserStats } = require('../stats/aggregateUserStats.js');

const STATS_CACHE_TTL_SECONDS = 5 * 60;

router.post('/', authLimiter, async (req, res) => {
    const { username, email, password } = req.body;

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const user = new User({
        username,
        email,
        passwordHash,
    });

    const savedUser = await user.save();
    res.status(201).json(savedUser);
});

const findOwnedQuestion = (user, questionId) =>
  user.questions.find((id) => id.toString() === questionId);

router.get('/:userId/questions', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const user = await User.findById(req.params.userId).populate('questions');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user.questions);
});

router.post('/:userId/questions', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const user = req.user;

  const { questionNumber, questionName, questionLink, titleSlug, topicTags, difficulty, status, needsReview } = req.body;

  const existingQuestion = await Question.findOne({ questionNumber, questionName });
    if (existingQuestion) {
        return res.status(400).json({ error: 'question already exists' });
    }

  const question = new Question({
    questionNumber,
    questionName,
    questionLink,
    titleSlug,
    topicTags,
    difficulty,
    status,
    needsReview,
  });

  const savedQuestion = await question.save();
  user.questions.push(savedQuestion._id);
  await user.save();

  res.status(201).json(savedQuestion);
});

router.put('/:userId/questions/:questionId', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!findOwnedQuestion(user, req.params.questionId)) {
    return res.status(404).json({ error: 'Question not found for this user' });
  }

  const updatedQuestion = await Question.findByIdAndUpdate(req.params.questionId, req.body, {
    new: true,
    runValidators: true,
  });
  res.json(updatedQuestion);
});

router.delete('/:userId/questions/:questionId', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const user = await User.findById(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!findOwnedQuestion(user, req.params.questionId)) {
    return res.status(404).json({ error: 'Question not found for this user' });
  }

  user.questions = user.questions.filter((id) => id.toString() !== req.params.questionId);
  await user.save();
  await Question.findByIdAndDelete(req.params.questionId);

  res.status(204).end();
});

router.get('/:userId/reviews/due', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const reviews = await Review.find({
    userId: req.params.userId,
    nextReviewDate: { $lte: new Date() },
  })
    .populate('questionId', 'questionName questionLink difficulty')
    .sort({ nextReviewDate: 1 });

  res.json(reviews);
});

router.get('/:userId/stats', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const cacheKey = `stats:user:${req.params.userId}`;

  const cached = await getCached(cacheKey);
  if (cached) {
    return res.json({ cached: true, ...cached });
  }

  const stats = await computeUserStats(req.params.userId);
  if (!stats) {
    return res.status(404).json({ error: 'User not found' });
  }

  await setCached(cacheKey, stats, STATS_CACHE_TTL_SECONDS);

  res.json({ cached: false, ...stats });
});

// weak_areas is written by the analytics/ PySpark+scikit-learn pipeline
// (run manually, not on every request), not through a Mongoose model, so
// this reads the raw collection directly rather than defining one just for
// this one read path.
const CLUSTER_SORT_ORDER = { weak: 0, medium: 1, strong: 2 };

router.get('/:userId/weak-areas', tokenExtractor, userExtractor, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const weakAreas = await mongoose.connection.db
    .collection('weak_areas')
    .find({ userId: req.params.userId })
    .toArray();

  weakAreas.sort(
    (a, b) => (CLUSTER_SORT_ORDER[a.cluster] ?? 99) - (CLUSTER_SORT_ORDER[b.cluster] ?? 99)
  );

  res.json(weakAreas);
});

module.exports = router;
