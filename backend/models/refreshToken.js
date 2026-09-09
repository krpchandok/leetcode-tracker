const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // A hash of the refresh token JWT, not the token itself — a DB read
  // shouldn't hand over something directly usable, same reasoning as
  // storing passwordHash instead of the password. sha256 (not bcrypt) is
  // enough here: the input is already a high-entropy signed JWT, not a
  // low-entropy human password, so there's nothing for a slow hash to
  // protect against that a fast one doesn't.
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// TTL index: MongoDB automatically deletes a document once its expiresAt is
// in the past, so expired/rotated-out refresh tokens don't need a manual
// cleanup job.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
module.exports = RefreshToken;
