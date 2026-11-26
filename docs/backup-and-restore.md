# Backup and Restore Guide

This guide describes best practices for preserving and recovering CosmosVote contract deployment data.

## What to Back Up

After deploying CosmosVote contracts, back up the following artifacts:

| Artifact | Location | Description |
|----------|----------|-------------|
| Contract IDs | `.env` (`GOVERNANCE_CONTRACT_ID`, `TOKEN_CONTRACT_ID`) | On-chain addresses of deployed contracts |
| WASM hashes | Deployment script output | Identifies the exact code version deployed |
| Deployer key | Secure secret storage | Account that holds admin privileges |
| Network config | `config/<env>.toml` | RPC endpoint and passphrase used at deploy time |

## Backing Up Contract Deployment Metadata

### 1. Save contract IDs immediately after deployment

After running a deploy script, contract IDs are printed to stdout. Persist them:

```bash
# Capture deploy output
bash scripts/deploy.sh 2>&1 | tee deploy-$(date +%Y%m%d).log

# Extract and store contract IDs
grep 'CONTRACT_ID' deploy-$(date +%Y%m%d).log >> .env
```

### 2. Archive the deployment log

```bash
mkdir -p backups/
cp deploy-$(date +%Y%m%d).log backups/
```

### 3. Store secrets securely

Never commit `STELLAR_SECRET_KEY` to version control. Use a secrets manager:

- **AWS Secrets Manager** / **GCP Secret Manager** for cloud deployments
- **1Password** / **Bitwarden** for team environments
- **Encrypted local file**: `gpg --symmetric .env` → store the `.env.gpg`

### 4. Version-pin WASM artifacts

```bash
# After make build, archive the compiled WASMs with the git commit SHA
tar -czf backups/wasm-$(git rev-parse --short HEAD).tar.gz \
  target/wasm32-unknown-unknown/release/*.wasm
```

## Recovery Steps

### Scenario A: Lost contract IDs

If you lose `GOVERNANCE_CONTRACT_ID` or `TOKEN_CONTRACT_ID`:

1. Check deployment logs in `backups/`.
2. Query the Stellar network for contracts deployed by your account:
   ```bash
   stellar contract history --network <env> --source-account <YOUR_PUBLIC_KEY>
   ```
3. Restore the IDs to `.env` and verify:
   ```bash
   stellar contract invoke --id <CONTRACT_ID> --network <env> -- get_admin
   ```

### Scenario B: Failed deployment (partial state)

If a deployment script fails mid-way:

1. Check which contracts were deployed from the log output.
2. If the token contract deployed but governance did not:
   ```bash
   # Re-run deploy with the existing token contract ID
   TOKEN_CONTRACT_ID=<existing_id> bash scripts/deploy.sh
   ```
3. If the governance contract initialized but is in a bad state, **do not re-initialize** — call `cancel` on any open proposals via admin, then redeploy with a new contract ID.

### Scenario C: Network incident / RPC outage

1. Switch to an alternate RPC endpoint by updating `config/<env>.toml` or `.env`:
   ```toml
   rpc_url = "https://alternate-rpc.stellar.org"
   ```
2. Verify contract state is intact:
   ```bash
   stellar contract invoke --id $GOVERNANCE_CONTRACT_ID --network testnet -- get_proposal_count
   ```
3. On-chain state is maintained by the Stellar network — no data is lost during an RPC outage.

### Scenario D: Accidental admin key loss

If the admin private key is lost and you have a multisig setup:

1. Use the multisig recovery procedure in [`docs/admin-multisig-pattern.md`](./admin-multisig-pattern.md).
2. If no multisig is configured, the contract admin is permanently locked — redeploy.

## Faucet Database (SQLite WAL Mode)

The faucet service stores its state in a SQLite database that runs in **WAL (Write-Ahead Logging) mode**. In WAL mode, committed transactions are first appended to a `-wal` sidecar file and only later merged back into the main database file during a *checkpoint*.

To keep the WAL from growing unboundedly across crashes or container restarts, the faucet performs a checkpoint in two situations:

| Trigger | Behaviour |
|---------|-----------|
| Graceful shutdown (SIGINT/SIGTERM) | `PRAGMA wal_checkpoint(TRUNCATE)` is executed before the process exits, flushing the WAL into the main DB file and truncating the `-wal` file to zero bytes |
| WAL grows beyond 1 000 pages | A checkpoint is triggered automatically so the WAL does not grow without bound during long-running operation |

### Implications for Backups

- **Preferred: checkpoint, then copy.** Stop the faucet gracefully (or otherwise ensure a checkpoint has run) so the `-wal` file is truncated, then copy only the main database file. This yields a single, self-contained snapshot.
- **Copying a live database:** if you cannot stop the faucet, you must copy the database file **together with** its `-wal` and `-shm` sidecar files (e.g. `faucet.db`, `faucet.db-wal`, `faucet.db-shm`). Copying only the main file while the WAL contains unmerged transactions will produce an inconsistent or stale backup.
- **Restoring:** place the main database file and any `-wal`/`-shm` files back in the same directory. SQLite will replay the WAL on the next open and checkpoint it automatically.

```bash
# Safe backup of a stopped faucet (WAL already truncated)
cp faucet.db backups/faucet-$(date +%Y%m%d).db

# Backup of a live faucet: include WAL sidecars
cp faucet.db faucet.db-wal faucet.db-shm backups/
```

## Recommended Tooling

| Tool | Purpose |
|------|---------|
| [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-stellar-cli) | Query and interact with deployed contracts |
| [Stellar Laboratory](https://laboratory.stellar.org/) | Inspect transactions and contract state visually |
| `gpg` | Encrypt and store `.env` secrets locally |
| AWS/GCP Secrets Manager | Production secret storage |
| Git (tagged releases) | Version-pin WASM builds to commit SHAs |

## Pre-Deployment Checklist

- [ ] `.env` backed up securely
- [ ] WASM artifacts archived with git SHA
- [ ] Deployer key stored in secrets manager
- [ ] Deployment log directory exists (`mkdir -p backups/`)
- [ ] Target network RPC is reachable (`curl <rpc_url>/`)
