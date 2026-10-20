# CosmosVote Backend — Runbook

## Error Tracking Setup

The backend supports centralised error tracking via Sentry (or any
Sentry-compatible service such as GlitchTip).

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SENTRY_DSN` | No | Sentry DSN. If unset, errors are logged locally only. |
| `ERROR_TRACKING_DSN` | No | Alias for `SENTRY_DSN` — use one or the other. |
| `NODE_ENV` | No | Reported as the Sentry environment (`development` / `staging` / `production`). |
| `APP_VERSION` | No | Release tag sent to Sentry (e.g. git SHA or semver). Set in CI. |

### Enabling Sentry

1. Create a project in [sentry.io](https://sentry.io) (or your self-hosted instance).
2. Copy the DSN from **Settings → Projects → \<project\> → Client Keys**.
3. Set it in your environment:

```bash
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

If `SENTRY_DSN` is unset the service starts normally and logs errors to stderr only.

### Source maps

Upload source maps in CI after building:

```bash
npx @sentry/cli releases new "$APP_VERSION"
npx @sentry/cli releases files "$APP_VERSION" upload-sourcemaps ./dist --url-prefix '~/'
npx @sentry/cli releases finalize "$APP_VERSION"
```

### Sensitive data scrubbing

The following are scrubbed before any event is sent to Sentry:

- Request headers matching `secret`, `password`, `token`, `key`, `dsn`, `authorization`, `cookie`
- Extra context keys matching the same pattern
- Request cookies (always removed)

Never log or store raw DSN values — they are excluded from pino output via the redact config in `src/logger.ts`.
