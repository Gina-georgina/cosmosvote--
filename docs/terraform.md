# Terraform Setup & Environment Configuration

This guide explains how to provision and manage CosmosVote infrastructure using Terraform, including workspace setup and environment-specific configurations.

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) v1.5+
- Stellar/Soroban RPC access for target network
- Appropriate credentials (secret keys, API tokens) for the target environment

---

## Repository Layout

```
infra/
├── main.tf           # Root module — providers, backend
├── variables.tf      # Input variable declarations
├── outputs.tf        # Output values
└── envs/
    ├── local.tfvars      # Local development overrides
    ├── testnet.tfvars    # Testnet environment values
    └── mainnet.tfvars    # Mainnet environment values
```

---

## Workspace Setup

Terraform workspaces map directly to deployment environments. Create and select a workspace before applying:

```bash
# Initialize the backend
terraform init

# Create workspaces (first time only)
terraform workspace new local
terraform workspace new testnet
terraform workspace new mainnet

# List available workspaces
terraform workspace list

# Switch to a workspace
terraform workspace select testnet
```

The active workspace name is exposed as `terraform.workspace` inside `.tf` files, allowing conditional logic per environment.

---

## The `envs/` Folder

Each `.tfvars` file in `envs/` supplies environment-specific variable values. Pass the relevant file with `-var-file` when running plan/apply:

```bash
terraform plan  -var-file="envs/testnet.tfvars"
terraform apply -var-file="envs/testnet.tfvars"
```

### `envs/local.tfvars`

```hcl
network             = "local"
stellar_rpc_url     = "http://localhost:8000/soroban/rpc"
governance_contract = ""   # populated after first deploy
token_contract      = ""
```

### `envs/testnet.tfvars`

```hcl
network             = "testnet"
stellar_rpc_url     = "https://soroban-testnet.stellar.org"
governance_contract = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
token_contract      = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

### `envs/mainnet.tfvars`

```hcl
network             = "mainnet"
stellar_rpc_url     = "https://mainnet.stellar.validationcloud.io/v1/<API_KEY>"
governance_contract = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
token_contract      = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

> **Never commit real secret keys or API tokens.** Use environment variables or a secrets manager and reference them via `TF_VAR_*` or a secrets backend.

---

## Full Workflow Per Environment

### Local

```bash
terraform workspace select local
terraform plan  -var-file="envs/local.tfvars"
terraform apply -var-file="envs/local.tfvars"
```

### Testnet

```bash
terraform workspace select testnet
terraform plan  -var-file="envs/testnet.tfvars"
terraform apply -var-file="envs/testnet.tfvars"
```

### Mainnet

```bash
terraform workspace select mainnet
# Always review the plan before applying to mainnet
terraform plan  -var-file="envs/mainnet.tfvars" -out=mainnet.plan
terraform apply mainnet.plan
```

---

## Sensitive Variables

Pass secrets at runtime via environment variables rather than storing them in `.tfvars`:

```bash
export TF_VAR_stellar_secret_key="S..."
terraform apply -var-file="envs/testnet.tfvars"
```

Or declare a `terraform.tfvars` file locally (add to `.gitignore`) for developer convenience.

---

## Remote State Backend (S3 + DynamoDB)

Terraform state is stored remotely in S3 with DynamoDB-based locking to prevent concurrent `apply` conflicts.

### Resources

| Resource | Name |
|----------|------|
| S3 bucket | `cosmosvote-tfstate` |
| DynamoDB lock table | `cosmosvote-tfstate-lock` |
| State key (staging) | `cosmosvote/staging/terraform.tfstate` |
| State key (production) | `cosmosvote/production/terraform.tfstate` |

### One-Time Bootstrap

Run the following commands **once** per AWS account, before calling `terraform init` for the first time:

```bash
# 1. Create the state bucket (us-east-1)
aws s3api create-bucket \
  --bucket cosmosvote-tfstate \
  --region us-east-1

# 2. Enable versioning (allows state rollback)
aws s3api put-bucket-versioning \
  --bucket cosmosvote-tfstate \
  --versioning-configuration Status=Enabled

# 3. Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket cosmosvote-tfstate \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# 4. Block all public access
aws s3api put-public-access-block \
  --bucket cosmosvote-tfstate \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 5. Create the DynamoDB lock table
aws dynamodb create-table \
  --table-name cosmosvote-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Initializing with a Backend Config

Backend configuration is split per environment in `infra/terraform/envs/`:

```bash
# Staging
terraform init -backend-config="envs/staging.s3.tfbackend"

# Production
terraform init -backend-config="envs/production.s3.tfbackend"
```

Each `.s3.tfbackend` file sets the correct `key` path for that environment so staging and production state are stored separately under the same bucket.

### State Locking

The `dynamodb_table = "cosmosvote-tfstate-lock"` entry in the backend block enables automatic state locking. Terraform acquires a lock before every `plan` and `apply`, and releases it when the operation completes. If a process is interrupted, run:

```bash
terraform force-unlock <LOCK_ID>
```

with the lock ID printed in the error message.

---

## State Management

| Environment | Recommended Backend |
|-------------|-------------------|
| local       | Local filesystem (`terraform.tfstate`) |
| testnet     | Remote (S3, GCS, or Terraform Cloud) |
| mainnet     | Remote with locking enabled |

Configure the backend in `main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket = "cosmosvote-tfstate"
    key    = "cosmosvote/${terraform.workspace}/terraform.tfstate"
    region = "us-east-1"
  }
}
```

---

## Drift Detection

Infrastructure drift occurs when the actual cloud resources diverge from the declared Terraform state (for example, manual changes made in the AWS console). A scheduled GitHub Actions workflow detects drift automatically.

### Schedule

The workflow (`.github/workflows/terraform-drift.yml`) runs `terraform plan` **daily** on a cron schedule, and can also be triggered manually via `workflow_dispatch`.

### Required Secrets

Configure the following repository secrets before enabling the workflow:

| Secret | Description |
|--------|-------------|
| `AWS_DRIFT_ROLE_ARN` | ARN of an IAM role with **read-only** AWS permissions (e.g. `ReadOnlyAccess` plus `s3:GetObject`/`s3:ListBucket` on the state bucket and `dynamodb:GetItem`/`dynamodb:PutItem`/`dynamodb:DeleteItem` on the lock table). The workflow assumes this role via OIDC — no long-lived keys. |
| `TEAM_WEBHOOK_URL` | Incoming webhook URL (Slack/Teams) that receives drift alerts. |

The workflow uses read-only credentials only: it never runs `terraform apply`, so drift is reported but never auto-remediated.

### Running the Plan Locally

Reproduce the drift check on your machine with the same read-only credentials:

```bash
terraform init -backend-config="envs/production.s3.tfbackend"
terraform workspace select mainnet
terraform plan -var-file="envs/mainnet.tfvars" -detailed-exitcode
```

`terraform plan -detailed-exitcode` returns:

| Exit code | Meaning |
|-----------|---------|
| `0` | No changes — no drift |
| `1` | Error during plan |
| `2` | Changes present — drift detected |

### Interpreting Drift Alerts

When the plan is non-empty, the workflow posts an alert to `TEAM_WEBHOOK_URL` containing the workflow run link and a summary of the detected changes.

1. Open the linked workflow run and review the `terraform plan` output.
2. Determine whether the change was intentional (e.g. an approved hotfix) or accidental.
3. If intentional, update the Terraform configuration to match and merge it so the next plan is clean.
4. If accidental, revert the manual change in the AWS console (or re-apply Terraform after review).
5. Never apply directly from the drift workflow — always go through the normal reviewed `apply` process.

---

## Related

- [Configuration reference](./config/) — `local.toml`, `testnet.toml`, `mainnet.toml`
- [Deploy scripts](../scripts/deploy.sh)
- [Getting Started](./GETTING_STARTED.md)
