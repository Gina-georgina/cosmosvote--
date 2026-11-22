# CosmosVote Notification Service

An off-chain Node.js service that polls Stellar Horizon for CosmosVote governance events and dispatches notifications to subscribers via email or webhook.

---

## How It Works

1. The service polls the Horizon `/contracts/{id}/events` endpoint on a configurable interval.
2. It filters events by the governance contract topics: `(gov, created)`, `(gov, voted)`, `(gov, final)`, `(gov, exec)`, `(gov, cancel)`.
3. For each event, it finds matching subscribers and sends email (via nodemailer/SMTP) and/or HTTP POST (webhook).
4. The last-seen Horizon paging cursor is persisted so the service resumes without replaying events on restart.

---

## Setup

### Prerequisites

- Node.js 18+
- An SMTP server (for email notifications)
- A deployed CosmosVote governance contract

### Install

```bash
cd notification-service
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your values
```

Key variables:

| Variable | Description |
|----------|-------------|
| `HORIZON_URL` | Horizon server URL (testnet or mainnet) |
| `GOVERNANCE_CONTRACT_ID` | Deployed governance contract address |
| `POLL_INTERVAL_MS` | How often to poll for new events (default: 15000) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port (default: 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `EMAIL_FROM` | Sender address for email notifications |
| `SUBSCRIPTIONS_FILE` | Path to persisted subscriptions JSON (default: `./data/subscriptions.json`) |
| `WEBHOOK_SECRET` | Shared secret used to HMAC-SHA256 sign webhook deliveries |

---

## Running

```bash
# Development (ts-node)
npm run dev start

# Production (compile first)
npm run build
npm start start
```

---

## Subscription Management

Subscriptions are managed via the CLI. Each subscriber can filter by proposal ID and/or event type.
The notification service does not currently expose HTTP subscribe or unsubscribe endpoints, and its
subscription store is a JSON file rather than a database. The RBAC helpers in
`notification-service/src/auth.ts` are not connected to these CLI commands; they do not provide
per-subscriber API-key authentication.

Run the CLI only in a trusted operator environment. Issue #39's Bearer-key flow requires an HTTP API
and persistent key storage to be designed and implemented before those operations can be
authenticated as API requests.

### Subscribe to all events (email)

```bash
npx ts-node src/index.ts subscribe \
  --email alice@example.com \
  --events created,voted,final,exec,cancel
```

### Subscribe to a specific proposal (webhook)

```bash
npx ts-node src/index.ts subscribe \
  --webhook https://example.com/hooks/governance \
  --proposal-id 42 \
  --events final,exec,cancel
```

### Subscribe with both email and webhook

```bash
npx ts-node src/index.ts subscribe \
  --email alice@example.com \
  --webhook https://example.com/hooks/governance \
  --events created,final
```

### List subscribers

```bash
npx ts-node src/index.ts list
```

### Remove a subscriber

```bash
npx ts-node src/index.ts unsubscribe <subscriber-id>
```

---

## Event Types

| Topic | Description |
|-------|-------------|
| `created` | A new proposal was created |
| `voted` | A vote was cast |
| `final` | A proposal was finalized (Passed or Rejected) |
| `exec` | A proposal was executed |
| `cancel` | A proposal was cancelled |

---

## Webhook Payload

Webhooks receive an HTTP POST with JSON body:

```json
{
  "event": {
    "type": "final",
    "proposalId": "42",
    "ledger": 12345678,
    "raw": { ... }
  }
}
```

### Verifying webhook signatures

Every webhook delivery includes an `X-CosmosVote-Signature` header. The value is the
hex-encoded HMAC-SHA256 of the **raw JSON request body** (the exact bytes sent on the
wire, before any parsing or re-serialization), computed with the shared secret configured
via the `WEBHOOK_SECRET` environment variable.

Consumers should:

1. Read the raw request body as a `Buffer` (do not parse and re-stringify the JSON first —
   key ordering and whitespace changes will invalidate the signature).
2. Compute the HMAC-SHA256 of those raw bytes using the shared secret.
3. Compare the computed digest with the header value using a constant-time comparison.

Node.js (Express) example:

```js
const crypto = require('crypto');
const express = require('express');

const app = express();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Capture the raw body so the signature can be verified over the exact bytes sent.
app.post(
  '/hooks/governance',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const received = req.get('X-CosmosVote-Signature') || '';
    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(req.body) // req.body is a Buffer of the raw JSON
      .digest('hex');

    const receivedBuf = Buffer.from(received, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    const valid =
      receivedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(receivedBuf, expectedBuf);

    if (!valid) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    // ... handle payload.event ...
    res.status(200).send('ok');
  }
);
```

If the signature does not match, reject the request (e.g. respond with `401`) and do not
process the payload.

---

## Subscription File Format

Subscriptions are stored in the JSON file configured by `SUBSCRIPTIONS_FILE`:

```json
{
  "cursor": "12345678-0",
  "subscribers": [
    {
      "id": "a1b2c3d4-...",
      "events": ["created", "final"],
      "email": "alice@example.com"
    },
    {
      "id": "e5f6g7h8-...",
      "proposalId": "42",
      "events": ["final", "exec", "cancel"],
      "webhookUrl": "https://example.com/hooks/governance"
    }
  ]
}
```

---

## Project Structure

```
notification-service/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── watcher.ts        # Horizon event poller
│   ├── notifier.ts       # Email and webhook dispatch
│   ├── subscriptions.ts  # Subscription CRUD + matching
│   └── types.ts          # Shared types
├── .env.example
├── package.json
└── tsconfig.json
```
