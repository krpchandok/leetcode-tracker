const crypto = require('crypto');
const { logger } = require('./logger.js');

// Every request gets a trace ID from here on — either the caller's own
// (so an upstream gateway/proxy's trace survives) or a freshly generated
// one. req.log is a pino child logger pre-tagged with it, so route handlers
// can just call req.log.info(...)/req.log.error(...) and every line
// automatically carries the trace ID, without threading it through every
// call manually.
const traceIdMiddleware = (req, res, next) => {
  const traceId = req.get('x-trace-id') || crypto.randomUUID();

  req.traceId = traceId;
  req.log = logger.child({ traceId });

  res.set('x-trace-id', traceId);

  next();
};

module.exports = { traceIdMiddleware };
