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

## Related

- [Configuration reference](./config/) — `local.toml`, `testnet.toml`, `mainnet.toml`
- [Deploy scripts](../scripts/deploy.sh)
- [Getting Started](./GETTING_STARTED.md)
