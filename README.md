# LeetCode Tracker

A full-stack app for tracking LeetCode practice: log solves (manually or via
an optional background poll of LeetCode's own public API), see weak-area
clustering computed by a PySpark/scikit-learn pipeline, and get spaced-repetition
review reminders (SM-2) for problems you've solved before.

**Live demo:** _add your deployed URL here once deployed — see "Deploying" below._

> **Cold start notice:** the API and frontend both run on Render's free tier,
> which spins down after ~15 minutes of no traffic. The first request after
> a period of inactivity can take 30-60 seconds to wake the service back up
> — refresh once if the first load seems stuck. Subsequent requests are fast.

## How it works

- **Frontend** — React + TypeScript (Vite), talks to the API over HTTPS. No
  browser extension, no install step — log a solve directly from the
  dashboard, or let the background poller pick up new accepted submissions
  from your LeetCode profile automatically.
- **API** (`backend/`) — Express + MongoDB (Mongoose). Handles auth, serves
  stats/reviews, and publishes newly logged solves onto a Kafka topic rather
  than writing them synchronously — see "Event flow" below.
- **Kafka** — two consumers process events asynchronously:
  - `sync-service` upserts the `Question` document and links it to the user.
  - `scheduling-service` computes the next SM-2 review date.

  In production these run *in the same process* as the API (see
  `ENABLE_INPROCESS_CONSUMERS` in `backend/app.js`) because Render's free
  tier doesn't include a free always-on background-worker tier. Locally
  (`docker compose up`), they run as their own containers instead — either
  way, the flow is the same genuinely event-driven pipeline, just a
  different process topology.
- **Redis** — caches per-user stats (5 min TTL), actively invalidated when a
  new submission is processed so the dashboard doesn't show stale numbers.
- **Analytics** (`analytics/`) — a PySpark + scikit-learn batch job, not an
  always-on service. It reads solved/attempted problems from MongoDB,
  engineers per-tag features, clusters them into weak/medium/strong with
  KMeans, and writes the result back to MongoDB. The dashboard only ever
  reads that pre-computed result — it never waits on Spark in the request
  path. Runs on a schedule via GitHub Actions (see `.github/workflows/scheduled-tasks.yml`),
  not Render, since Render Cron Jobs aren't free either.
- **Scheduling** (`backend/scheduling/sm2.js`) — the SM-2 spaced-repetition
  algorithm, given a coarse quality signal (solved vs. not) since LeetCode
  submissions don't carry a graded recall score.

### Event flow

```
"Log a solve" form  ─┐
                      ├─▶ POST /api/leetcode/submissions/log ─▶ Kafka topic
LeetCode poll (cron) ─┘        (submissions.raw)
                                        │
                                        ▼
                              sync-service consumer
                          (upserts Question, links user,
                           invalidates stats cache)
                                        │
                                        ▼
                          Kafka topic (submission.processed)
                                        │
                                        ▼
                          scheduling-service consumer
                         (computes next SM-2 review date)
```

## Local development

Requires Node 20+, Python 3.11 (for the analytics pipeline), and a MongoDB
connection string (Atlas free tier, or a local `mongod`).

```bash
# Backend
cd backend
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET at minimum
npm install
npm run dev             # API on :3001

# In separate terminals, for the full event-driven flow (requires
# docker compose up kafka redis, or your own local Kafka/Redis):
npm run consumer:sync
npm run consumer:scheduling
npm run cron             # optional: warmStatsCache + pollLeetCodeSubmissions on a schedule

# Frontend
cd ../leetcode-tracker
npm install
npm run dev              # :5173, proxies to the API via VITE_API_URL
```

Or, to run everything (API, both consumers, frontend) fully containerized
against a self-hosted Kafka/Redis:

```bash
docker compose up --build
```

To run the analytics pipeline locally against the same MongoDB instance:

```bash
cd analytics
cp .env.example .env    # fill in MONGODB_URI; AWS_* only if you want S3 archival
pip install -r requirements.txt
python run_pipeline.py
```

## Deploying

The deploy target is [Render](https://render.com) for the app (`render.yaml`
Blueprint — a free Web Service for the API, a free Static Site for the
frontend) plus a free [GitHub Actions](https://github.com/features/actions)
scheduled workflow (`.github/workflows/scheduled-tasks.yml`) standing in for
the background jobs a paid Render Background Worker/Cron Job would otherwise
run. Kafka and Redis are both managed/serverless (Upstash) rather than
self-hosted, so nothing here silently stops running when a host goes idle —
the worst case on a cold Render instance is a delayed response, never a
dropped background job, since Kafka durably holds unconsumed messages until
the next time the consumer process wakes up.

### External services you need to set up

You'll need accounts with the following. None of this is optional if you
want the deployed app to work — flagging all of it up front:

1. **MongoDB Atlas** (if not already set up) — free M0 cluster. Under
   Network Access, allow `0.0.0.0/0` (both Render's and GitHub Actions'
   outbound IPs are dynamic/unpredictable, so an IP allowlist isn't
   practical here). Get the connection string from Database > Connect.
2. **Upstash Kafka** — [upstash.com](https://upstash.com), free tier. Create
   a cluster, create a topic (or let the app create it — kafkajs will on
   first publish), and grab the broker endpoint + username + password from
   the cluster's REST/Kafka credentials page.
3. **Upstash Redis** — same account, free tier. Create a database and copy
   its `rediss://` connection string.
4. **Render** — [render.com](https://render.com), free tier. Connect your
   GitHub account, then New > Blueprint pointed at this repo (it reads
   `render.yaml` automatically). Render will prompt you to fill in
   `MONGODB_URI`, `KAFKA_BROKER`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`, and
   `REDIS_URL` — paste in the values from steps 1-3. `JWT_SECRET` and
   `ADMIN_TASK_TOKEN` are auto-generated by Render, no action needed —
   but copy `ADMIN_TASK_TOKEN`'s generated value from the service's
   Environment tab afterward, you'll need it for step 5.
5. **GitHub Actions repo secrets** — in this repo's Settings > Secrets and
   variables > Actions, add:
   - `BACKEND_URL` — the API service's Render URL, e.g.
     `https://leetcode-tracker-api.onrender.com` (no trailing slash).
   - `ADMIN_TASK_TOKEN` — the value Render generated in step 4.
   - `MONGODB_URI` — same connection string as step 1 (the analytics job
     talks to MongoDB directly, not through the API).
   - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` /
     `S3_BUCKET_NAME` — only if you want the analytics pipeline to archive
     each run's results to S3 (see `analytics/AWS_SETUP.md`). Optional —
     the pipeline skips archival cleanly if these aren't set.

Once all five are done, push to `main` (Render auto-deploys on push) and the
scheduled workflow will start firing on its own cron schedule — or trigger
it once by hand from the Actions tab (`workflow_dispatch`) to confirm
everything's wired up correctly.

## Observability

- Structured JSON logs (pino) with a trace ID propagated through the whole
  Kafka pipeline, so one request's log lines can be followed end to end
  across the API and both consumers.
- Prometheus metrics at `/api/metrics` (sync request counts/durations,
  Kafka messages processed per consumer, standard Node process metrics).
