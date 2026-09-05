const { queryLeetCode } = require('./client.js');
const Problem = require('../models/problem.js');
const { info } = require('../utils/logger.js');

const PAGE_SIZE = 100;

const syncProblems = async () => {
  let skip = 0;
  let total = Infinity;
  let created = 0;
  let updated = 0;

  while (skip < total) {
    const { data } = await queryLeetCode('problems.graphql', {
      categorySlug: '',
      limit: PAGE_SIZE,
      skip,
      filters: {},
    });

    total = data.questionList.totalNum;

    for (const question of data.questionList.data) {
      if (question.isPaidOnly) {
        continue;
      }

      const result = await Problem.updateOne(
        { titleSlug: question.titleSlug },
        {
          $set: {
            questionId: Number(question.questionId),
            title: question.title,
            difficulty: question.difficulty,
            topicTags: question.topicTags.map((tag) => tag.name),
            isPaidOnly: question.isPaidOnly,
            lastSynced: new Date(),
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        created += 1;
      } else if (result.modifiedCount > 0) {
        updated += 1;
      }
    }

    skip += PAGE_SIZE;
  }

  const summary = { total, created, updated };
  info(`Synced ${created + updated} problems, ${created} new, ${updated} updated`);
  return summary;
};

module.exports = { syncProblems };
