const mongoose = require('mongoose');
const { MONGODB_URI } = require('../utils/config.js');
const { info, error } = require('../utils/logger.js');

info('Connecting to MongoDB...');
mongoose.connect(MONGODB_URI)
  .then(() => info('Connected to MongoDB'))
  .catch((err) => error('Error connecting to MongoDB:', err));
