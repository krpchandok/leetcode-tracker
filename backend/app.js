// This Express app is the system's single HTTP entry point — the "API
// gateway." Everything that speaks HTTP (the React frontend, curl, etc.)
// talks to this process and only this process. The Kafka consumers
// (kafka/syncConsumer.js, kafka/schedulingConsumer.js) and the cron process
// (cron/index.js) are separate standalone processes with no HTTP surface of
// their own — they read Mongo/Kafka/Redis directly and are never reached
// through this app.

const express = require('express');
const cors = require('cors');
require('./database/database.js');
const questionsRouter = require('./router/questionRoutes.js');
const userRouter = require('./router/userRoutes.js');
const { unknownEndpoint, errorHandler } = require('./utils/middleware.js');
const loginRouter = require('./router/loginRoutes.js');
const leetcodeRouter = require('./router/leetcodeRoutes.js');
const { authLimiter, apiLimiter, leetcodeLimiter } = require('./utils/rateLimiters.js');
const { traceIdMiddleware } = require('./utils/traceId.js');
const { register } = require('./utils/metrics.js');

// Comma-separated list so both the Vite dev server and the Chrome
// extension's chrome-extension://<id> origin can be allowed at once, e.g.
// "http://localhost:5173,chrome-extension://<your-extension-id>". The
// extension's real id isn't known until it's loaded unpacked once via
// chrome://extensions (see extension/manifest.json) — add it here and
// restart the backend once you have it.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

const app = express();

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());
app.use(traceIdMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Standard, unauthenticated Prometheus scrape target. Note: this process's
// registry only sees metrics recorded IN this process (the API gateway) —
// leetcode_sync_requests_total and leetcode_sync_duration_seconds are
// genuinely recorded here, but kafka_messages_processed_total is recorded
// in the separate syncConsumer.js/schedulingConsumer.js processes and is
// exposed via their own small metrics servers instead (see
// utils/metricsServer.js) — separate OS processes can't share one
// in-memory prom-client registry, so this is the standard multi-process
// Prometheus pattern (one scrape target per process), not a shortcut.
app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/questions', apiLimiter, questionsRouter);
app.use('/api/users', apiLimiter, userRouter);
app.use('/api/login', authLimiter, loginRouter);
app.use('/api/leetcode', leetcodeLimiter, leetcodeRouter);

app.use(unknownEndpoint);
app.use(errorHandler);

module.exports = app;
