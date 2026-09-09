const jwt = require('jsonwebtoken');
const { error } = require('./logger.js');
const User = require('../models/users.js');

const unknownEndpoint = (req, res) => {
  res.status(404).json({ error: 'unknown endpoint' });
};

const tokenExtractor = (req, res, next) => {
  const authorization = req.get('authorization');
  req.token = authorization && authorization.toLowerCase().startsWith('bearer ')
    ? authorization.substring(7)
    : null;
  next();
};

const userExtractor = async (req, res, next) => {
  if (!req.token) {
    return res.status(401).json({ error: 'token missing' });
  }

  const decodedToken = jwt.verify(req.token, process.env.JWT_SECRET);
  // Refresh tokens are signed with this same secret (see utils/tokens.js),
  // so without this check a leaked refresh token could be replayed here
  // directly as a Bearer access token for its full 7-day life instead of
  // the access token's 15 minutes — the `type` claim is what actually
  // keeps the two from being interchangeable.
  if (!decodedToken.id || decodedToken.type !== 'access') {
    return res.status(401).json({ error: 'token invalid' });
  }

  const user = await User.findById(decodedToken.id);
  if (!user) {
    return res.status(401).json({ error: 'user not found' });
  }

  req.user = user;
  next();
};

const errorHandler = (err, req, res, next) => {
  error(err.message);

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'malformatted id' });
  } else if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  } else if (err.name === 'MongoServerError' && err.message.includes('E11000')) {
    return res.status(400).json({ error: 'expected `username` to be unique' });
  } else if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'invalid token' });
  } else if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'token expired' });
  }

  next(err);
};

module.exports = { unknownEndpoint, errorHandler, tokenExtractor, userExtractor };
