# Docker Compose Local Dev Environment

This guide covers running the full CosmosVote stack locally using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2 (bundled with Docker Desktop)

## Services

| Service | Description | Port |
|---------|-------------|------|
| `dev` | Builder image — full Rust toolchain for development and testing | — |
| `stellar-node` | Local Stellar node with Soroban RPC enabled | `8001:8000` |
| `rpc-proxy` | Nginx reverse proxy in front of the Stellar RPC | `8000:8000` |
| `faucet` | Faucet service — signs and submits testnet funding transactions | `3000:3000` |
| `artifacts` | Minimal runtime image shipping WASM artifacts only (profile: `artifacts`) | — |

## Environment Variables

Copy the example file and edit as needed:

```bash
cp .env.example .env
```

Key variables used by Docker Compose:

| Variable | Default | Description |
|----------|---------|-------------|
| `NETWORK` | `local` | Network to connect to (`local` \| `testnet` \| `mainnet`) |
| `STELLAR_RPC_URL` | `http://stellar-node:8000` | Soroban RPC endpoint (within Compose network) |
| `STELLAR_NETWORK_PASSPHRASE` | `Standalone Network ; February 2021` | Must match the running node |
| `STELLAR_SECRET_KEY` | — | Admin secret key for deployment scripts |
| `FAUCET_SECRET_KEY_FILE` | `/run/secrets/faucet_secret_key` | Path to the file containing the faucet signing keypair (mounted via Compose `secrets:`) |
| `GOVERNANCE_CONTRACT_ID` | — | Populated after running `deploy.sh` |
| `TOKEN_CONTRACT_ID` | — | Populated after running `deploy.sh` |

> The `dev` service injects `STELLAR_RPC_URL` and `STELLAR_NETWORK_PASSPHRASE` automatically. You do not need to set them in `.env` for local development.

### Faucet secret

The faucet signing keypair is **not** passed via an environment variable. Instead, the `faucet` service reads it from a file whose path is given by `FAUCET_SECRET_KEY_FILE`. Docker Compose mounts the secret read-only at `/run/secrets/faucet_secret_key`:

```yaml
services:
  faucet:
    environment:
      FAUCET_SECRET_KEY_FILE: /run/secrets/faucet_secret_key
    secrets:
      - faucet_secret_key

secrets:
  faucet_secret_key:
    file: ./secrets/faucet_secret_key.txt
```

Create the secret file locally (the `secrets/` directory is git-ignored — never commit it):

```bash
mkdir -p secrets
printf '%s' 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' > secrets/faucet_secret_key.txt
chmod 600 secrets/faucet_secret_key.txt
```

The file is mounted read-only at `/run/secrets/faucet_secret_key` inside the container, so it is never exposed through `/proc/<pid>/environ`, logs, or crash dumps. The key is never logged, even at `DEBUG` level.

> **Deprecated:** the `FAUCET_ADMIN_SECRET_KEY` environment variable is still accepted as a fallback for local development only and emits a deprecation warning at startup. Do not use it — prefer `FAUCET_SECRET_KEY_FILE` (or AWS Secrets Manager in production).

## Quick Start

### 1. Start the local Stellar node

```bash
docker compose up stellar-node -d
```

The node exposes the Soroban RPC at `http://localhost:8001`. The `rpc-proxy` re-exposes it at `http://localhost:8000`.

### 2. Run tests inside the dev container

```bash
docker compose run --rm dev make test
```

### 3. Build WASM binaries

```bash
docker compose run --rm dev make build
```

Built WASM artifacts are written to `target/wasm32-unknown-unknown/release/` inside the mounted workspace volume.

### 4. Open an interactive dev shell

```bash
docker compose run --rm dev bash
```

From inside the shell you have access to the full Rust toolchain, `stellar` CLI, `make`, and all project scripts.

### 5. Build the minimal runtime (WASM artifacts only)

```bash
docker compose --profile artifacts build artifacts
```

This produces a small `debian:bookworm-slim`-based image containing only the compiled WASM files and the Stellar CLI — suitable for CI artifact storage or deployment pipelines.

## Full Stack (node + dev shell)

```bash
# Bring up the Stellar node and proxy in the background
docker compose up stellar-node rpc-proxy -d

# Run the deploy script against the local node
docker compose run --rm dev bash scripts/deploy.sh

# Watch logs
docker compose logs -f stellar-node
```

## Stopping / Cleaning Up

```bash
# Stop all services
docker compose down

# Remove volumes (clears the Stellar chain state and Cargo cache)
docker compose down -v
```

## Ports Summary

| Host port | Container port | Service |
|-----------|---------------|---------|
| `8000` | `8000` | `rpc-proxy` (Soroban RPC) |
| `8001` | `8000` | `stellar-node` (direct access) |

> If port `8000` is already in use on your machine, edit `docker-compose.yml` and change the host-side port mapping for `rpc-proxy`.

## Troubleshooting

**`stellar-node` health check fails on first start**  
The Stellar quickstart image takes up to 30 seconds to initialize. The `dev` service waits for it automatically via `depends_on: condition: service_healthy`. If the health check never passes, check the node logs:

```bash
docker compose logs stellar-node
```

**Permission errors on the mounted workspace volume**  
The container runs as root. If generated files (e.g., `target/`) are owned by root on the host, run:

```bash
sudo chown -R $USER:$USER target/
```

**Cargo cache not persisting between runs**  
The `cargo-cache` and `target-cache` named volumes persist between `docker compose run` invocations. They are cleared only when you run `docker compose down -v`.
