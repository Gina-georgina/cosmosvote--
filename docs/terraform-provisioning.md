# Infrastructure Provisioning Guide

This guide covers how to initialize and apply infrastructure for each CosmosVote environment using the provided configuration files and deploy scripts.

## Environments

CosmosVote supports three deployment environments:

| Environment | Config File | Network |
|-------------|-------------|--------|
| Local | `config/local.toml` | Standalone (localhost:8000) |
| Testnet | `config/testnet.toml` | Test SDF Network |
| Mainnet | `config/mainnet.toml` | Public Global Stellar Network |

## Prerequisites

- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-stellar-cli) installed
- Rust with `wasm32-unknown-unknown` target
- A funded Stellar account (testnet/mainnet)
- `.env` file configured (see `.env.example`)

```bash
cp .env.example .env
# Edit .env with your STELLAR_SECRET_KEY, network settings, etc.
```

## Initializing Each Environment

### Local

```bash
# Start a local Stellar node (requires Docker)
docker compose up -d

# Deploy contracts to local network
NETWORK=local bash scripts/deploy.sh
```

### Testnet

```bash
# Fund your account on testnet
stellar account fund --network testnet <YOUR_PUBLIC_KEY>

# Deploy to testnet
NETWORK=testnet bash scripts/deploy.sh
```

### Mainnet

```bash
# Ensure your account is funded with real XLM
# Review scripts/deploy_mainnet.sh carefully before running
NETWORK=mainnet bash scripts/deploy_mainnet.sh
```

## Variable Structure

Each environment config (`config/*.toml`) provides:

```toml
rpc_url = "<Soroban RPC endpoint>"
network_passphrase = "<Network identifier string>"
network = "<local|testnet|mainnet>"
```

### Environment-specific values

**local.toml**
```toml
rpc_url = "http://localhost:8000"
network_passphrase = "Standalone Network ; February 2021"
network = "local"
```

**testnet.toml**
```toml
rpc_url = "https://soroban-testnet.stellar.org"
network_passphrase = "Test SDF Network ; September 2015"
network = "testnet"
```

**mainnet.toml**
```toml
rpc_url = "https://soroban-mainnet.stellar.org"
network_passphrase = "Public Global Stellar Network ; September 2015"
network = "mainnet"
```

Additional variables are set via `.env`:

| Variable | Description |
|----------|-------------|
| `STELLAR_SECRET_KEY` | Deployer account secret key |
| `STELLAR_RPC_URL` | Overrides config RPC URL if set |
| `GOVERNANCE_CONTRACT_ID` | Deployed governance contract address |
| `TOKEN_CONTRACT_ID` | Deployed token contract address |
| `NETWORK` | Active environment (`local`/`testnet`/`mainnet`) |

## Troubleshooting

### `Error: account not found`
The deployer account is not funded. Fund it via `stellar account fund` (testnet) or a wallet (mainnet).

### `Error: contract already initialized`
The contract was previously deployed to this network. To redeploy, use a new account or update the contract ID in `.env`.

### `Error: WASM binary not found`
Build the contracts first:
```bash
make build
```

### RPC connection refused (local)
Ensure the local Docker node is running:
```bash
docker compose up -d
docker compose ps  # verify 'stellar' service is healthy
```

### Transaction simulation failed
Check that your `network_passphrase` in the config matches the running network exactly.

## Terraform State: Staging vs Production

The Terraform configuration in `infra/terraform/` is shared between environments, but
**state is separated per environment** so that a change targeting staging can never
touch production resources (and vice versa).

### Backend config files

Each environment has its own partial backend configuration file under
`infra/terraform/envs/`:

| Environment | Backend config file | State key |
|-------------|---------------------|-----------|
| Staging | `infra/terraform/envs/staging.s3.tfbackend` | `cosmosvote/staging/terraform.tfstate` |
| Production | `infra/terraform/envs/production.s3.tfbackend` | `cosmosvote/production/terraform.tfstate` |

The backend block in `infra/terraform/main.tf` is intentionally **partial** (no
`key`), so the state key is always supplied at init time:

```hcl
terraform {
  backend "s3" {}
}
```

### Initializing a workspace

Always pass `-backend-config` when running `terraform init`:

```bash
cd infra/terraform

# Staging
terraform init -backend-config=envs/staging.s3.tfbackend

# Production
terraform init -backend-config=envs/production.s3.tfbackend
```

> **Note:** Re-run `terraform init -reconfigure -backend-config=...` whenever you
> switch between environments in the same working directory. Mixing backend configs
> without `-reconfigure` will fail with a "backend configuration changed" error.

### Per-environment variables

Environment-specific values (repository name, required status checks, reviewers,
etc.) live in `infra/terraform/envs/<env>.tfvars` and are passed with `-var-file`:

```bash
terraform plan  -var-file=envs/staging.tfvars
terraform apply -var-file=envs/staging.tfvars
```

### CI plan job

The CI pipeline runs `terraform fmt -check`, `terraform validate` and
`terraform plan` for **both** environments whenever files under `infra/terraform/`
change. The plan job uses the matching `-backend-config` and `-var-file` for each
environment, so a plan for staging is never produced against production state.
Plans are posted as a comment on the pull request for review before merge.

## Branch Protection: Migrating Manual Settings

Branch protection for `main` is now managed in Terraform
(`github_branch_protection` resource). The rules enforce:

- Pull request required before merging
- Required status checks must pass
- Force pushes disabled
- Branch deletion disabled

The settings previously configured by hand in GitHub must be imported into
Terraform state **before** the first `apply`, otherwise Terraform will attempt to
create a duplicate resource and fail.

### Import steps

1. Initialize the backend for the target environment (see above).
2. Import the existing protection rule into state:

   ```bash
   cd infra/terraform
   terraform init -backend-config=envs/production.s3.tfbackend

   terraform import \
     -var-file=envs/production.tfvars \
     github_branch_protection.main \
     <owner>/<repo>:main
   ```

   Replace `<owner>/<repo>` with the GitHub repository (e.g. `cosmosvote/cosmosvote`).

3. Verify the imported state matches the configuration:

   ```bash
   terraform plan -var-file=envs/production.tfvars
   ```

   The plan should report **no changes**. If it proposes changes, reconcile the
   HCL with the current GitHub settings (or accept the diff deliberately) before
   applying.

4. Repeat for staging using `envs/staging.s3.tfbackend` and `envs/staging.tfvars`.

Once imported, all future changes to branch protection go through pull requests
against the Terraform configuration and are applied by CI.
