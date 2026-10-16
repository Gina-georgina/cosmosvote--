# CosmosVote Backend

Off-chain notification service for CosmosVote. Polls Soroban/Horizon RPC for governance contract events and delivers them to a configured webhook.

## HTTP API and OpenAPI

This package runs a background worker and does not currently expose notification-service HTTP
routes. `WEBHOOK_URL` is an outbound destination for event delivery, not an API served by this
process. Consequently, there is no `/openapi.json` or `/docs` endpoint to document yet. Issue #42
requires an HTTP API and its request/response contracts to be defined before an OpenAPI
specification and Swagger UI can be generated.

## Error Tracking

Errors are captured via [Sentry](https://sentry.io). Set `SENTRY_DSN` in your environment to enable. Without it, errors are written to `stderr` only.

### Alert Trigger Conditions

| Condition | Severity | Details |
|-----------|----------|---------|
| Unhandled exception | **Critical** | Captured automatically on process startup via `Sentry.init()` |
| Unhandled promise rejection | **Critical** | Captured automatically |
| Event polling failure | **Warning** | Captured on every failure; tagged `alertThresholdReached=true` when ≥ 3 consecutive failures occur |
| Webhook delivery failure | **Error** | Captured with webhook URL and event type |

### Setting Up Alerts in Sentry

1. Go to **Alerts → Create Alert Rule** in your Sentry project.
2. Create an issue alert for:
   - `alertThresholdReached = true` (poll failures) — notify on-call immediately.
   - Any `Critical` level event — page on-call immediately.
   - Any `Error` level event in `production` environment — notify team channel.

## Setup

```bash
cd backend
cp .env.example .env
# Edit .env
npm install
npm run build
npm start
```

## Development

```bash
npm run dev   # run with ts-node (no build needed)
npm test      # run tests
```
