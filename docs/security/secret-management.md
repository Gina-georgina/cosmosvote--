# Secret Management

## Core Rules

- **Never commit secrets** — private keys, tokens, passwords, and API keys must not appear in source code or git history.
- Use `.gitignore` to exclude `.env` and credential files. See `.env.example` for the list of required variables.
- Rotate any secret that has been accidentally committed immediately.

## Environment Variables

Copy `.env.example` to `.env` and populate locally:

```bash
cp .env.example .env
```

`.env` is git-ignored. Never commit it. Required variables:

| Variable | Purpose |
|---|---|
| `STELLAR_SECRET_KEY` | Signing key for deployments |
| `STELLAR_RPC_URL` | Network RPC endpoint |
| `GOVERNANCE_CONTRACT_ID` | Deployed governance contract |
| `TOKEN_CONTRACT_ID` | Deployed token contract |

## Faucet Signing Key

The faucet signing keypair must **not** be supplied through a plain environment variable. Environment variables are visible in `/proc`, process listings, logs, and crash dumps, which increases the exposure risk of the key.

The faucet loads its key from exactly **one** of the following sources:

| Source | Configuration | Notes |
|---|---|---|
| Secret file (recommended) | `FAUCET_SECRET_KEY_FILE=/run/secrets/faucet_secret_key` | Path to a file containing the Stellar secret key (`S...`). The file should be mounted read-only and readable only by the faucet process. |
| AWS Secrets Manager | `FAUCET_SECRET_KEY_AWS_SECRET_ID=<secret-id>` | The secret value is fetched at startup using the ambient AWS credentials/role. |

Exactly one source must be configured. If none is set, or more than one is set, the faucet fails fast at startup rather than guessing.

### Deprecated env var fallback

`FAUCET_SECRET_KEY` and `FAUCET_ADMIN_SECRET_KEY` are **deprecated**. They are only intended for local development convenience. When either is used, the faucet emits a deprecation warning at startup. Do not use them in staging or production — use `FAUCET_SECRET_KEY_FILE` or AWS Secrets Manager instead.

### Logging

The faucet key is redacted from all log output, including at `DEBUG` level. Never log, `echo`, or otherwise print the key or the contents of the secret file. Avoid dumping the full environment or process arguments in debugging output.

### Docker Compose example

Mount the secret file into the container and point the faucet at it:

```yaml
services:
  faucet:
    image: stellar-faucet:latest
    environment:
      FAUCET_SECRET_KEY_FILE: /run/secrets/faucet_secret_key
    secrets:
      - faucet_secret_key

secrets:
  faucet_secret_key:
    file: ./secrets/faucet_secret_key   # git-ignored, never committed
```

The `./secrets/` directory must be listed in `.gitignore`. The key file must never be committed to the repository or echoed in shell commands, CI logs, or documentation.

## CI / GitHub Actions
=======

Store all secrets in **GitHub Secrets** (Settings → Secrets and variables → Actions), not in workflow files or committed configs.

Reference them in workflows as `${{ secrets.SECRET_NAME }}`. Never `echo` secret values in logs.

## Service Account Keys

- Generate dedicated service accounts with the minimum required permissions.
- Store keys exclusively in GitHub Secrets or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault).
- Rotate keys on a schedule (recommend: 90 days) and immediately after any team member departure.
- Delete unused keys promptly.

## Secret Scanning

A `secret-scan` CI job runs [gitleaks](https://github.com/gitleaks/gitleaks) on every push and pull request to detect committed secrets. The job is **required for merge** — a detected secret blocks the PR until it is removed from the code (and, if already pushed, from git history) and the secret is rotated.

The rule set (configured in `.gitleaks.toml`) detects, among others:

- **Stellar secret keys** — strings starting with `S` followed by 55 base32 characters (`S[A-Z2-7]{55}`).
- **API tokens** — generic high-entropy tokens and known provider token formats.
- **JWT secrets** — hardcoded signing keys and secret assignments.
- **Database connection strings** — URIs containing embedded credentials (e.g. `postgres://user:pass@host`).
- **Private key headers** — `-----BEGIN ... PRIVATE KEY-----` blocks.

### Suppressing false positives

If gitleaks flags a non-secret (e.g. a test fixture or documentation example), add a suppression entry to `.gitleaksignore` at the repository root instead of disabling the rule. Each entry is a finding fingerprint in the form `commit:file:rule-id:line`:

```
# .gitleaksignore
# Example: placeholder key in docs
abc123def456:docs/security/secret-management.md:stellar-secret-key:42
```

Get the fingerprint from the gitleaks output in the failed CI job, or run locally:

```bash
gitleaks detect --source . --report-format json --report-path gitleaks-report.json
```

Suppressions should be rare and reviewed — never add an entry to silence a real secret.
