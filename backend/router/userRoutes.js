const router = require('express').Router();
const User = require('../models/users.js');
const Question = require('../models/question.js');
const bcrypt = require('bcrypt');
const { tokenExtractor, userExtractor } = require('../utils/middleware.js');

router.post('/', async (req, res) => {
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

  const { questionNumber, questionName, questionLink, difficulty, status, needsReview } = req.body;

  const existingQuestion = await Question.findOne({ questionNumber, questionName });
    if (existingQuestion) {
        return res.status(400).json({ error: 'question already exists' });
    }
    
  const question = new Question({
    questionNumber,
    questionName,
    questionLink,
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

module.exports = router;
