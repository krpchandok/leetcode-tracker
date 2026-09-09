const jwt = require('jsonwebtoken');
const router = require('express').Router();
const User = require('../models/users.js');
const RefreshToken = require('../models/refreshToken.js');
const { signAccessToken, issueRefreshToken, hashToken } = require('../utils/tokens.js');

// Same error shape as userExtractor's TokenExpiredError/JsonWebTokenError
// handling in utils/middleware.js ({ error: '...' } strings), but these
// come back as "refresh token expired"/"refresh token invalid" rather than
// "token expired"/"token invalid" — the frontend interceptor should only
// ever try to refresh in response to the access-token error, never this
// one (that would just loop), so the two need to read as distinct strings.
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'refresh token missing' });
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'refresh token expired' });
    }
    return res.status(401).json({ error: 'refresh token invalid' });
  }

  if (decoded.type !== 'refresh') {
    return res.status(401).json({ error: 'refresh token invalid' });
  }

  // The JWT alone only proves it was validly signed and hasn't hit its own
  // exp claim — checking it against the persisted hash is what actually
  // makes revocation (rotation below, or logout) possible before then.
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
  if (!stored) {
    return res.status(401).json({ error: 'refresh token invalid' });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ error: 'refresh token invalid' });
  }

  // Rotate on every use: delete the one just spent and issue a fresh one.
  // A stolen-but-not-yet-used refresh token and the legitimate client's copy
  // can no longer both keep working — whichever refreshes first invalidates
  // the other.
  await RefreshToken.deleteOne({ _id: stored._id });
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = await issueRefreshToken(user);

  res.status(200).json({ token: newAccessToken, refreshToken: newRefreshToken });
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.deleteOne({ tokenHash: hashToken(refreshToken) });
  }
  res.status(204).end();
});

module.exports = router;
