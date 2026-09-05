const router = require('express').Router();
const Question = require('../models/question.js');

router.get('/', async (req, res) => {
  const questions = await Question.find({});
  res.json(questions);
});

router.get('/:id', async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (question) {
    res.json(question);
  } else {
    res.status(404).end();
  }
});

router.post('/', async (req, res) => {
  const { questionNumber, questionName, questionLink, titleSlug, topicTags, difficulty, status, needsReview } = req.body;

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
  res.status(201).json(savedQuestion);
});

router.put('/:id', async (req, res) => {
  const updatedQuestion = await Question.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (updatedQuestion) {
    res.json(updatedQuestion);
  } else {
    res.status(404).end();
  }
});

router.delete('/:id', async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);
  res.status(204).end();
});


module.exports = router;
