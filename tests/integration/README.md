# Integration test (frontend + contracts)

This folder contains a scaffold for a cross-package integration test that exercises the frontend against deployed contracts, as well as Rust integration tests that exercise the contracts directly.

Requirements:
- Docker (for local Soroban quickstart)
- Node.js and npm for frontend tooling
- `stellar` CLI in PATH (used by scripts/deploy.sh)
- Rust toolchain (for the Rust contract integration tests)

Quick start (local):

```bash
# Start a local Soroban node
docker-compose up -d stellar-node

# Build and deploy contracts (requires STELLAR_SECRET_KEY in env or .env)
STELLAR_SECRET_KEY="<your secret>" ./scripts/deploy.sh

# In frontend, install deps and start dev server
cd frontend
npm install
npm run dev

# In another shell, run the Playwright integration tests (assumes frontend at http://localhost:5173)
npx playwright test tests/integration
```

CI: The integration test requires a running Soroban environment and secrets; it is not enabled by default in CI. See the main issue for recommended CI setup.

## Rust contract integration tests

The Rust integration tests live alongside this README and exercise the contracts directly (no frontend or Docker required). They run against the Soroban test environment.

### Governance → treasury disbursement flow

`governance_treasury_flow.rs` covers the end-to-end flow where a passed governance proposal triggers an actual treasury disbursement:

1. Deploys the governance, token, and treasury contracts.
2. Creates a proposal containing a `TreasuryAction`.
3. Casts votes so the proposal passes, then finalises and executes it.
4. Asserts the treasury balance is decremented by the disbursed amount.
5. Asserts the recipient's token balance is incremented by the disbursed amount.

### Running the tests

Run all integration tests (including the governance → treasury flow) via the Makefile target:

```bash
make test-integration
```

To run only the governance → treasury flow test directly with Cargo:

```bash
cargo test --test governance_treasury_flow