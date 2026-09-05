const http = require('http');
const { register } = require('./metrics.js');
const { info } = require('./logger.js');

// Kafka consumers are separate OS processes from the Express app, so they
// can't share its in-memory prom-client registry — each needs its own
// small scrape target. This is the standard multi-process Prometheus
// pattern (one target per process), not a workaround.
const startMetricsServer = (port) => {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  server.listen(port, () => {
    info(`metrics server listening on http://localhost:${port}/metrics`);
  });

  return server;
};

module.exports = { startMetricsServer };
