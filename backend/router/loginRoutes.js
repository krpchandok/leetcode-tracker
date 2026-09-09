const bcrypt = require('bcrypt');
const router = require('express').Router();
const User = require('../models/users.js');
const { signAccessToken, issueRefreshToken } = require('../utils/tokens.js');

router.post('/', async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    const passwordCorrect = user === null
        ? false
        : await bcrypt.compare(password, user.passwordHash);

    if (!(user && passwordCorrect)) {
        return res.status(401).json({
            error: 'invalid username or password'
        });
    }

    const token = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user);

    res.status(200).json({ token, refreshToken, username: user.username, id: user._id.toString() });
});

module.exports = router;