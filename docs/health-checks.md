# Infrastructure Health Checks

Health check configuration and remediation guide for deployed CosmosVote services.

---

## Health Check Endpoints

| Service | Endpoint | Method | Expected Response |
|---------|----------|--------|-------------------|
| Frontend (Vite/React) | `http://<host>:3000/` | GET | HTTP 200 |
| Backend liveness | `http://<host>:8080/health` | GET | `{"status":"ok","uptime":<seconds>}` |
| Backend readiness | `http://<host>:8080/ready` | GET | HTTP 200 when Soroban RPC is healthy; otherwise HTTP 503 |
| Backend version | `http://<host>:8080/version` | GET | `{"version":"<version>","commitSha":"<sha>","buildDate":"<date>"}` |
| Horizon RPC Connector | `https://<horizon-url>/` | GET | HTTP 200 + JSON |
| Soroban RPC | `https://<rpc-url>/` | POST `getHealth` | `{"status":"healthy"}` |

### Version Endpoint

`GET /version` returns the build metadata of the running notification service. It does not require authentication, so it can be used by deployment pipelines and monitoring to confirm which release is live.

```bash
curl -s http://<host>:8080/version | jq .
# expected:
# {
#   "version": "1.4.0",
#   "commitSha": "3f2a9c1",
#   "buildDate": "2024-06-01T12:00:00Z"
# }
```

The values are injected at build time from environment variables:

| Variable | Description |
|----------|-------------|
| `VERSION` | Release version string (e.g. `1.4.0`) |
| `COMMIT_SHA` | Git commit SHA of the deployed build |
| `BUILD_DATE` | ISO 8601 timestamp of when the build was produced |

These are read when the backend starts (or baked into the image during the build step) and served verbatim by `/version`. If a variable is unset, the corresponding field is returned as an empty string, so a missing value is visible rather than silently defaulted.

```bash
VERSION=1.4.0 COMMIT_SHA=$(git rev-parse --short HEAD) \
  BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose up -d backend
```

### Soroban RPC Health Call

```bash
curl -s -X POST https://<rpc-url> \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  | jq .result.status
# expected: "healthy"
```

---

## Automated Probes

### Docker Compose Health Checks

The backend listens on `HEALTH_PORT` (default `8080`). Its health server is separate from the worker's RPC endpoint. The current Compose `dev` service is an interactive development container, not the backend process, so it cannot use these endpoints as its own healthcheck without starting the backend in that container.

When running the backend as a service, configure its healthcheck as follows:

```yaml
services:
  frontend:
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3

  backend:
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3

Use `/ready` for readiness probes. `/health` only indicates that the backend process is running. This backend has no database; `/ready` checks the configured Soroban RPC using `getHealth` and returns HTTP 503 if the RPC is unreachable or unhealthy.
```

### Cron-Based Probe Script

`scripts/health_check.sh` runs all checks and alerts on failure:

```bash
#!/usr/bin/env bash
set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://localhost:8080/health}"
HORIZON_URL="${STELLAR_HORIZON_URL:-https://horizon-testnet.stellar.org}"

fail() { echo "[FAIL] $1"; exit 1; }

curl -sf "$FRONTEND_URL"       >/dev/null || fail "Frontend unreachable"
curl -sf "$NOTIFICATION_URL"   >/dev/null || fail "Notification service unreachable"
curl -sf "$HORIZON_URL"        >/dev/null || fail "Horizon RPC unreachable"

echo "[OK] All services healthy"
```

Add to crontab (every 5 minutes):

```
*/5 * * * * /bin/bash /workspaces/cosmosvote/scripts/health_check.sh >> /var/log/cosmosvote-health.log 2>&1
```

---

## Remediation Actions

| Failure | Remediation |
|---------|-------------|
| Frontend down | `docker compose restart frontend` or redeploy static build |
| Notification service down | `docker compose restart notification`; check logs with `docker compose logs notification` |
| Horizon RPC unreachable | Switch `STELLAR_HORIZON_URL` to a fallback endpoint (e.g., `https://horizon.stellar.org`) |
| Soroban RPC unhealthy | Check ledger sync status; switch `STELLAR_RPC_URL` to alternate RPC provider |
| All services down | Restart full stack: `docker compose down && docker compose up -d` |

Check application logs:

```bash
docker compose logs --tail=100 <service>
```

---

## Related

- [`.env.example`](../.env.example) — environment variable reference
- [`docker-compose.yml`](../docker-compose.yml) — service definitions
- [Stellar Horizon docs](https://developers.stellar.org/api/horizon)
- Depends on: #148
