# CosmosVote Keeper Service

Automated keeper bot that polls for expired Active proposals and calls `finalise()` every 10 minutes.

## Features

- ✅ Polls for expired proposals every 10 minutes
- ✅ Identifies proposals where `end_time < now` and `state == Active`
- ✅ Calls `finalise()` for each expired proposal
- ✅ Logs all finalization attempts
- ✅ Sends alerts on failures (Slack, Discord)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

Required variables:
- `SOROBAN_RPC_URL` - Soroban RPC endpoint
- `GOVERNANCE_CONTRACT_ID` - Deployed governance contract address
- `KEEPER_SECRET_KEY` - Secret key for the keeper account (must have XLM for fees)
- `POLL_INTERVAL_MINUTES` - Polling interval (default: 10)

Optional alert configuration:
- `SLACK_WEBHOOK_URL` - Slack webhook for failure alerts
- `DISCORD_WEBHOOK_URL` - Discord webhook for failure alerts

### 3. Run the service

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## GitHub Actions Deployment

The keeper can be deployed as a GitHub Actions scheduled workflow. See `.github/workflows/keeper-service.yml`.

The workflow runs every 10 minutes and:
1. Checks out the repository
2. Installs dependencies
3. Runs the keeper service once
4. Logs results

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Keeper Service                      │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │   Poller     │──────│   Soroban    │        │
│  │   (10 min)   │      │   RPC        │        │
│  └──────────────┘      └──────────────┘        │
│         │                      │                 │
│         ▼                      ▼                 │
│  ┌──────────────┐      ┌──────────────┐        │
│  │  Finalizer   │──────│  Governance  │        │
│  │              │      │  Contract    │        │
│  └──────────────┘      └──────────────┘        │
│         │                                        │
│         ▼                                        │
│  ┌──────────────┐                               │
│  │ Alert Service│──► Slack/Discord              │
│  └──────────────┘                               │
│                                                  │
└─────────────────────────────────────────────────┘
```

## Logging

All finalization attempts are logged to stdout:

```
[2026-10-16T10:00:00.000Z] Checking for expired proposals...
Found 2 expired proposal(s)
✅ Finalized proposal #42 (tx: abc123...)
✅ Finalized proposal #43 (tx: def456...)
```

Failures trigger alerts and are logged:

```
❌ Failed to finalize proposal #44: Simulation failed: quorum not met
```

## Security Considerations

- The keeper account (`KEEPER_SECRET_KEY`) needs XLM for transaction fees
- Keep the secret key secure - use GitHub Secrets for CI/CD
- The keeper can only call `finalise()`, which is permissionless
- Failed transactions do not revert on-chain state

## Monitoring

Monitor the keeper service via:
- GitHub Actions workflow logs
- Alert notifications (Slack/Discord)
- Stellar block explorer (search for keeper account transactions)

## Troubleshooting

**Issue:** Keeper fails with "insufficient balance"
- **Solution:** Fund the keeper account with XLM for transaction fees

**Issue:** Keeper fails with "simulation error"
- **Solution:** Check that proposals are actually expired and still in Active state

**Issue:** No proposals found
- **Solution:** Verify `GOVERNANCE_CONTRACT_ID` is correct and proposals exist

## Related

- Issue #132: [Product] Implement a proposal finalization keeper bot
- `scripts/finalise-expired-proposals.sh` - Manual finalization script
