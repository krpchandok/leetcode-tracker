const app = require('./app.js');
const { PORT } = require('./utils/config.js');
const { info } = require('./utils/logger.js');

app.listen(PORT, () => {
  info(`Server is running on http://localhost:${PORT}`);
});
