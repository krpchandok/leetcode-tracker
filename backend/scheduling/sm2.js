const MIN_EASE_FACTOR = 1.3;

// Standard SM-2 (SuperMemo 2) algorithm. `quality` is a 0-5 recall rating;
// state is the reviewer's prior { easeFactor, intervalDays, repetitions }.
const calculateNextReview = ({ easeFactor, intervalDays, repetitions }, quality) => {
  let nextRepetitions = repetitions;
  let nextIntervalDays = intervalDays;

  if (quality < 3) {
    nextRepetitions = 0;
    nextIntervalDays = 1;
  } else {
    nextRepetitions = repetitions + 1;
    if (nextRepetitions === 1) {
      nextIntervalDays = 1;
    } else if (nextRepetitions === 2) {
      nextIntervalDays = 6;
    } else {
      nextIntervalDays = Math.round(intervalDays * easeFactor);
    }
  }

  let nextEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (nextEaseFactor < MIN_EASE_FACTOR) {
    nextEaseFactor = MIN_EASE_FACTOR;
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + nextIntervalDays);

  return {
    easeFactor: nextEaseFactor,
    intervalDays: nextIntervalDays,
    repetitions: nextRepetitions,
    nextReviewDate,
  };
};

module.exports = { calculateNextReview };
