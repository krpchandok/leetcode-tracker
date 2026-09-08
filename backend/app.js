// This Express app is the system's single HTTP entry point — the "API
// gateway." Everything that speaks HTTP (the React frontend, curl, etc.)
// talks to this process and only this process.
//
// The Kafka consumers (kafka/syncConsumer.js, kafka/schedulingConsumer.js)
// and the cron process (cron/index.js) can also run as separate standalone
// processes with no HTTP surface of their own — that's what docker-compose
// does, and it's the shape to use on any host with a free/cheap always-on
// background-process tier. On Render, where only Web Services are free and
// Background Workers/Cron Jobs are paid-only, this same app process instead
// optionally starts the two consumers in-process (ENABLE_INPROCESS_CONSUMERS,
// below) and exposes the cron work as HTTP endpoints (router/adminRoutes.js)
// for an external scheduler to call — see .github/workflows/scheduled-tasks.yml.

const express = require('express');
const cors = require('cors');
require('./database/database.js');
const questionsRouter = require('./router/questionRoutes.js');
const userRouter = require('./router/userRoutes.js');
const { unknownEndpoint, errorHandler } = require('./utils/middleware.js');
const loginRouter = require('./router/loginRoutes.js');
const leetcodeRouter = require('./router/leetcodeRoutes.js');
const adminRouter = require('./router/adminRoutes.js');
const { authLimiter, apiLimiter, leetcodeLimiter } = require('./utils/rateLimiters.js');
const { traceIdMiddleware } = require('./utils/traceId.js');
const { register } = require('./utils/metrics.js');
const { info, error } = require('./utils/logger.js');

// Comma-separated list so the Vite dev server and the deployed frontend's
// origin can both be allowed at once, e.g.
// "http://localhost:5173,https://leetcode-tracker.onrender.com".
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
// registry only sees metrics recorded IN this process. leetcode_sync_requests_total
// and leetcode_sync_duration_seconds are always recorded here (the API
// gateway). kafka_messages_processed_total is recorded here too when
// ENABLE_INPROCESS_CONSUMERS is on (the consumers share this process's
// registry in that mode) — but when the consumers run as their own
// standalone processes instead (docker-compose), it's exposed via their own
// small metrics servers (see utils/metricsServer.js), since separate OS
// processes can't share one in-memory prom-client registry. Same metric,
// different scrape target depending on deploy shape.
app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/questions', apiLimiter, questionsRouter);
app.use('/api/users', apiLimiter, userRouter);
app.use('/api/login', authLimiter, loginRouter);
app.use('/api/leetcode', leetcodeLimiter, leetcodeRouter);
app.use('/api/admin', apiLimiter, adminRouter);

app.use(unknownEndpoint);
app.use(errorHandler);

// Opt-in: starts the sync-service and scheduling-service Kafka consumers
// inside this same process instead of as separate deploys. Off by default
// so docker-compose (which runs them as their own containers) is unaffected
// — set ENABLE_INPROCESS_CONSUMERS=true only for the single-Render-Web-Service
// deploy shape (see the file-level comment above and render.yaml).
if (process.env.ENABLE_INPROCESS_CONSUMERS === 'true') {
  const { startSyncConsumer } = require('./kafka/syncConsumer.js');
  const { startSchedulingConsumer } = require('./kafka/schedulingConsumer.js');

  Promise.all([startSyncConsumer(), startSchedulingConsumer()])
    .then(() => info('in-process Kafka consumers started (sync-service, scheduling-service)'))
    .catch((err) => error('failed to start in-process Kafka consumers:', err));
}

module.exports = app;
