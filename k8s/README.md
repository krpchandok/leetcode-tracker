# Running leetcode-tracker on local minikube

A third deploy option alongside `docker-compose.yml` (local containers) and
`render.yaml` (production). Same services, same env vars, same wiring —
just as Kubernetes Deployments/Services. MongoDB stays external (Atlas);
everything else (Kafka, Redis, the API, both consumers, the frontend) runs
in-cluster.

Tested end-to-end on minikube v1.38, Kubernetes v1.35, docker driver,
Windows + Docker Desktop.

## Prerequisites

- `kubectl` and `minikube` installed
- Docker (minikube's docker driver uses your existing Docker install)
- `backend/.env` already set up (same file docker-compose uses)
- A running MongoDB Atlas cluster — `MONGODB_URI` in `backend/.env` must
  point at it

```
minikube start
minikube addons enable ingress
```

## 1. Build the images into minikube's Docker daemon

minikube's docker driver runs its own Docker daemon separate from your
host's. Point your shell at it before building, so the images land where
the cluster's kubelet can find them (`imagePullPolicy: IfNotPresent` in the
manifests then uses these local images instead of trying to pull from a
registry):

```
eval $(minikube docker-env)          # PowerShell: & minikube -p minikube docker-env | Invoke-Expression

docker build -t leetcode-tracker-api:latest ./backend

docker build --build-arg VITE_API_URL=http://leetcode.local/api \
  -t leetcode-tracker-frontend:latest ./leetcode-tracker
```

`VITE_API_URL` is baked into the frontend's JS at build time (Vite), not
read at container runtime, and must be reachable from the *browser* — the
Ingress host below, not any in-cluster Service DNS name. If you rebuild the
frontend image later, re-run `eval $(minikube docker-env)` first in that
shell (it doesn't persist across terminals) and rebuild with the same
`--build-arg`.

## 2. Create the Secret

Sensitive values (`MONGODB_URI`, `JWT_SECRET`, `ADMIN_TASK_TOKEN`,
`SEED_DEMO_PASSWORD`, `KAFKA_USERNAME`, `KAFKA_PASSWORD`) come from
`backend/.env` into a Secret that's never committed
(`k8s/secret.yaml` is gitignored — `k8s/secret.example.yaml` is the
committed placeholder template).

**If `backend/.env`'s values are double-quoted** (e.g.
`MONGODB_URI="mongodb+srv://..."` — check yours before assuming either
way), don't build the Secret directly from that file with
`--from-env-file`: it does **not** strip quotes the way `dotenv` does, so
every value ends up with literal `"` characters in it and breaks Mongo's
connection-string parser (confirmed by testing this directly — it fails
with `MongoParseError: Invalid scheme`). Strip them with `dotenv.parse`
(already a project dependency) instead:

```
node -e "
const fs = require('fs');
const dotenv = require('dotenv');
const parsed = dotenv.parse(fs.readFileSync('backend/.env'));
parsed.KAFKA_USERNAME = '';
parsed.KAFKA_PASSWORD = '';
fs.writeFileSync('k8s/backend.secret.env',
  Object.entries(parsed).map(([k, v]) => k + '=' + v).join('\n') + '\n');
"

kubectl create secret generic backend-secrets \
  --from-env-file=k8s/backend.secret.env \
  --dry-run=client -o yaml > k8s/secret.yaml

rm k8s/backend.secret.env
```

`KAFKA_USERNAME`/`KAFKA_PASSWORD` are blanked deliberately: the in-cluster
Kafka broker is plaintext, no SASL/TLS, same reasoning as
`docker-compose.yml`'s comment on the same two variables. The Deployments
also carry an explicit `KAFKA_USERNAME=""`/`KAFKA_PASSWORD=""` override in
their pod spec regardless of what ends up in the Secret, so even a
`backend/.env` with real managed-Kafka credentials in it can't leak into
the local broker's SASL handshake — explicit `env:` entries always win over
`envFrom` in Kubernetes.

Alternative if you'd rather hand-fill values instead of reusing
`backend/.env`: copy `k8s/secret.example.yaml` to `k8s/secret.yaml` and
fill in the placeholders yourself.

## 3. Apply everything

```
kubectl apply -k k8s/
```

This creates the `leetcode-tracker` namespace and everything in it: the
ConfigMap, Secret, Kafka, Redis, the API, both Kafka consumers, the
frontend, and the Ingress.

The API and both consumers each carry an init container that blocks on
`nc -z kafka 29092` and `nc -z redis 6379` before their main container
starts — Kafka in particular takes a while to finish its KRaft bootstrap
on a cold cluster, and without this they'd crashloop a few times first
(compose's `depends_on` only waits for the container to *start*, not for
the broker to actually be accepting connections — this is a real
improvement over parity with compose, not just parity).

Check status:

```
kubectl get pods -n leetcode-tracker
kubectl logs -n leetcode-tracker deployment/sync-consumer
```

A stray `This server does not host this topic-partition` or `The group
coordinator is not available` in the first few seconds of the consumers'
logs is normal — the topic auto-creates on first use and the internal
`__consumer_offsets` topic takes a moment to settle on a freshly-started
broker. It self-heals; if it doesn't and the pod is actually crashlooping,
that's a real problem.

**If you edit `k8s/secret.yaml` or `k8s/configmap.yaml` and re-apply**,
already-running pods do *not* pick up the change on their own — Kubernetes
only injects `envFrom`/`env` values at pod creation. Force new pods with:

```
kubectl rollout restart deployment/api deployment/sync-consumer deployment/scheduling-consumer -n leetcode-tracker
```

## 4. Access the frontend

### Option A — Ingress (recommended, matches `k8s/ingress.yaml`)

The Ingress routes `leetcode.local/` to the frontend and `leetcode.local/api`
to the API — this is why the frontend image was built with
`VITE_API_URL=http://leetcode.local/api`, so the browser's own requests hit
the same origin the Ingress is listening on.

minikube's `ingress` addon runs as a `NodePort` Service, not a
`LoadBalancer` — on the docker driver (Windows/Mac), that means
`minikube tunnel` doesn't apply here (it's for `LoadBalancer` Services).
Use `minikube service` instead, which sets up its own local forwarding for
exactly this case:

```
minikube service -n ingress-nginx ingress-nginx-controller --url
```

This prints two URLs (HTTP and HTTPS) and keeps running in that terminal —
leave it open. Then either:

- add a hosts-file entry (`C:\Windows\System32\drivers\etc\hosts` on
  Windows, needs an elevated editor) mapping `leetcode.local` to
  `127.0.0.1`, and browse to `http://leetcode.local:<the-http-port>`, or
- send the `Host: leetcode.local` header manually without touching the
  hosts file at all, e.g. `curl -H "Host: leetcode.local" http://127.0.0.1:<port>/api/health`
  (useful for scripting/testing; a browser can't set this header itself,
  so the hosts-file route is what you want for actually using the app).

### Option B — `minikube service`, no Ingress

Skip the Ingress and reach the frontend and API directly:

```
minikube service frontend -n leetcode-tracker --url
minikube service api -n leetcode-tracker --url
```

The frontend image was already built with `VITE_API_URL=http://leetcode.local/api`
baked in, so with this option you'd need to rebuild it with
`--build-arg VITE_API_URL=<the api --url output>` instead — and since that
URL is a randomly-assigned ephemeral port that changes across
`minikube service` invocations, this is more of a quick-debugging fallback
than something to rely on day to day. Option A is the one actually worth
setting up.

## Health checks

- **API**: `GET /api/health` — a real endpoint, wired into both probes.
- **Kafka**: `kafka-broker-api-versions.sh --bootstrap-server localhost:9092`
  (ships in the `apache/kafka` image) — a real broker-readiness check, not
  just "is the port open."
- **Redis**: `redis-cli ping`.
- **Frontend**: `GET /` — nginx serves `index.html` for any unmatched path
  (see `leetcode-tracker/nginx.conf`), so this is a genuine check that
  nginx is up and serving.
- **sync-consumer / scheduling-consumer**: neither process exposes an HTTP
  health endpoint — only a Prometheus `/metrics` route
  (`backend/utils/metricsServer.js`), on ports 9101/9102 respectively. The
  probes here hit `/metrics` because it's a real, already-existing
  endpoint, not a fabricated one — but note what it actually proves: the
  process is alive and past its Mongo-connect step (metrics server binds
  before the Kafka consumer subscribes), **not** that it's successfully
  consuming from Kafka. There's no dedicated readiness signal for "this
  consumer is actually processing messages" in the current codebase — flagging
  this as a real gap rather than inventing an endpoint that isn't there.

## Teardown

```
kubectl delete -k k8s/
minikube stop        # or `minikube delete` to remove the cluster entirely
```

## Files

| File | Purpose |
|---|---|
| `kustomization.yaml` | ties everything together; `kubectl apply -k k8s/` |
| `namespace.yaml` | the `leetcode-tracker` namespace |
| `configmap.yaml` | non-sensitive env vars |
| `secret.example.yaml` | committed placeholder template — copy to `secret.yaml` and fill in, or generate `secret.yaml` per step 2 above |
| `secret.yaml` | **not committed** (gitignored) — your real values |
| `kafka-deployment.yaml` / `kafka-service.yaml` | single-broker KRaft Kafka, matching `docker-compose.yml`'s config |
| `redis-deployment.yaml` / `redis-service.yaml` | cache only, no persistence |
| `api-deployment.yaml` / `api-service.yaml` | the Express API |
| `sync-consumer-deployment.yaml` | Kafka consumer, `npm run consumer:sync` — no Service, not request-serving |
| `scheduling-consumer-deployment.yaml` | Kafka consumer, `npm run consumer:scheduling` — no Service |
| `frontend-deployment.yaml` / `frontend-service.yaml` | the built React app behind nginx |
| `ingress.yaml` | routes `leetcode.local/` and `leetcode.local/api` |

`docker-compose.yml` and `render.yaml` are unchanged — this is additive.
