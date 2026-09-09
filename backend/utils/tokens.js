const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const RefreshToken = require('../models/refreshToken.js');

// Both token kinds are signed with the same JWT_SECRET — deliberately, so
// there's exactly one secret to configure/rotate. They're told apart by
// their own `type` claim instead, which userExtractor (utils/middleware.js)
// and POST /api/auth/refresh (router/authRoutes.js) each check for — a
// refresh token can't be replayed as an access token, or vice versa, even
// though both verify successfully against the same secret.
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN = '7d';
const REFRESH_TOKEN_EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ id: user._id, username: user.username, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

// Issues a refresh token AND persists a hash of it, so it can be revoked
// (rotation on use, logout) independently of its own 7-day expiry — merely
// verifying the JWT's signature and exp claim can't express "this one was
// already used" or "the user logged out," only server-side state can.
const issueRefreshToken = async (user) => {
  const token = jwt.sign({ id: user._id, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_MS),
  });

  return token;
};

module.exports = {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  hashToken,
  signAccessToken,
  issueRefreshToken,
};
