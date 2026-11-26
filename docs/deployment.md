# Deployment Scripts

| Script | Target | Notes |
|--------|--------|-------|
| `deploy_testnet.sh` | Stellar testnet | Supports `DRY_RUN=1` for CI validation |
| `deploy_mainnet.sh` | Stellar mainnet | Requires interactive confirmation; irreversible |
| `deploy.sh` | local / testnet | General-purpose; set `NETWORK=testnet` for testnet |

---

## Required Inputs

All scripts read configuration from environment variables or a `.env` file at the project root.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STELLAR_SECRET_KEY` | Yes | — | Stellar secret key (`S...`, 56 chars) |
| `INITIAL_TOKEN_SUPPLY` | No | `1000000000` | Tokens minted to admin on init |
| `TOKEN_NAME` | No | `CosmosVote` | Human-readable token name |
| `TOKEN_SYMBOL` | No | `VOTE` | Ticker symbol |
| `TOKEN_DECIMALS` | No | `7` | Decimal places (7 is standard for Stellar) |
| `MIN_PROPOSAL_BALANCE` | No | `0` | Minimum token balance to create a proposal |
| `PROPOSAL_COOLDOWN` | No | `0` | Seconds between proposals per address |
| `RESTRICT_ADMIN_VOTE` | No | `false` | Prevent admin from voting on own proposals |

---

## Testnet Deployment

```bash
cp .env.example .env
# Edit .env — set STELLAR_SECRET_KEY at minimum

bash scripts/deploy_testnet.sh
```

### Dry Run (validates inputs without network calls)

```bash
DRY_RUN=1 bash scripts/deploy_testnet.sh
```

The dry-run mode checks:
- All required variables are present
- Numeric variables contain only digits
- `RESTRICT_ADMIN_VOTE` is `true` or `false`
- `STELLAR_SECRET_KEY` matches the Stellar secret key format

---

## Mainnet Deployment

```bash
bash scripts/deploy_mainnet.sh
```

You will be prompted to type `deploy mainnet` to confirm. Mainnet transactions are irreversible — review all parameters before running.

---

## CI Validation

The [Deploy Script Validation](.github/workflows/deploy-validation.yml) workflow runs automatically on every PR that modifies a deploy script:

1. **ShellCheck** — static analysis for syntax and common shell bugs (`-S warning`)
2. **Testnet dry run** — executes `deploy_testnet.sh` with `DRY_RUN=1` and stub credentials
3. **Mainnet syntax check** — `bash -n deploy_mainnet.sh` (no execution, no network calls)

---

## Testnet Deployment Gate

Testnet deployments are gated on integration tests. The
[Testnet Gate](.github/workflows/testnet-gate.yml) workflow runs
`make test-integration` and **must pass before any testnet deployment is
allowed**. If the integration suite fails, the deployment is blocked and a
notification is sent to the team webhook.

### How the gate works

1. The `testnet-gate.yml` workflow runs `make test-integration` on every push
   and pull request targeting the deployment branch.
2. The workflow exposes a single required status check named
   **`testnet-gate`**.
3. Deployment jobs (and any manual `deploy_testnet.sh` run in CI) declare
   `needs: testnet-gate`, so they cannot start until the integration tests pass.
4. On failure, the workflow posts a message to the team webhook
   (`TEAM_WEBHOOK_URL` repository secret) so the team is alerted immediately.

### Enforcing the gate as a required status check

The gate is only authoritative when it is configured as a **required status
check** on the deployment branch via branch protection. Configure it once in
the repository settings:

1. Go to **Settings → Branches → Branch protection rules**.
2. Add (or edit) a rule for the deployment branch (e.g. `main`).
3. Enable **Require status checks to pass before merging**.
4. Search for and select **`testnet-gate`** as a required check.
5. Enable **Require branches to be up to date before merging** so the gate runs
   against the latest code.
6. Save the rule.

Once configured, merges to the deployment branch — and therefore testnet
deployments — are blocked until `make test-integration` passes.

### Webhook notifications

Set the `TEAM_WEBHOOK_URL` repository secret (**Settings → Secrets and
variables → Actions**) to the team webhook endpoint. When the gate fails, the
workflow sends a notification containing the failing run URL so the team can
investigate before retrying the deployment.
