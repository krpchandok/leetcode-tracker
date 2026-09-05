const User = require('../models/users.js');
const Question = require('../models/question.js');
const Review = require('../models/review.js');

// Pure aggregation: no Redis, no Kafka, no route code. Testable on its own
// against a real userId.
const computeUserStats = async (userId) => {
  const user = await User.findById(userId).select('questions').lean();
  if (!user) {
    return null;
  }

  const questionIds = user.questions;
  const totalAttempted = questionIds.length;

  const [result] = await Question.aggregate([
    { $match: { _id: { $in: questionIds } } },
    {
      // topicTags (and the canonical difficulty) live on Problem, not
      // Question, so join on the titleSlug the two collections share.
      $lookup: {
        from: 'problems',
        localField: 'titleSlug',
        foreignField: 'titleSlug',
        as: 'problem',
      },
    },
    { $unwind: { path: '$problem', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        totalSolved: [{ $match: { status: 'solved' } }, { $count: 'count' }],
        byDifficulty: [
          { $match: { status: 'solved' } },
          {
            $group: {
              _id: { $ifNull: ['$problem.difficulty', '$difficulty'] },
              count: { $sum: 1 },
            },
          },
        ],
        byTag: [
          { $match: { status: 'solved' } },
          { $unwind: '$problem.topicTags' },
          {
            $group: {
              _id: '$problem.topicTags',
              count: { $sum: 1 },
            },
          },
          // Ascending count: the lowest-count tags surface first as the
          // "weak area" signal.
          { $sort: { count: 1 } },
        ],
      },
    },
  ]);

  const solvedByDifficulty = {};
  for (const row of result.byDifficulty) {
    solvedByDifficulty[row._id || 'Unknown'] = row.count;
  }

  const solvedByTag = {};
  for (const row of result.byTag) {
    solvedByTag[row._id] = row.count;
  }

  const reviewsDueCount = await Review.countDocuments({
    userId,
    nextReviewDate: { $lte: new Date() },
  });

  return {
    totalSolved: result.totalSolved[0]?.count || 0,
    totalAttempted,
    solvedByDifficulty,
    solvedByTag,
    reviewsDueCount,
  };
};

module.exports = { computeUserStats };
