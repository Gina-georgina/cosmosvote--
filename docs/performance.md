# Performance & Instruction Count Budget

Soroban charges fees based on CPU instruction counts. This document records the baseline instruction counts for key governance operations and defines the CI regression gate.

## Instruction Count Baselines

These baselines are stored in `contracts/governance/src/benchmarks.rs` as constants. CI fails if any operation exceeds its baseline by more than 10%.

| Operation | Baseline (instructions) | CI Limit (+10%) |
|-----------|------------------------|-----------------|
| `create_proposal` | 5,000,000 | 5,500,000 |
| `cast_vote` | 5,000,000 | 5,500,000 |
| `finalise` | 5,000,000 | 5,500,000 |

Soroban's per-transaction limit is **100,000,000 instructions**. All governance operations consume well under 10% of that budget.

## Scaling Analysis

- **`create_proposal`**: O(1) — reads token supply once, writes one proposal record.
- **`cast_vote`**: O(1) — reads voter balance at snapshot ledger, writes vote record and updated proposal totals. Cost does not grow with total voter count.
- **`finalise`**: O(1) — reads proposal totals (accumulated during voting), performs arithmetic checks, writes one state update.

## Running Benchmarks Locally

```bash
cargo test bench_ --features testutils -- --nocapture
```

This prints instruction counts for each operation and asserts they stay within the 10% regression threshold.

## CI Integration

The `benchmark` job in `.github/workflows/ci.yml` runs `cargo test bench_` on every push and pull request to `main` and `develop`. The job fails if any benchmark assertion fails, blocking the merge.

## Methodology

Benchmarks use the Soroban SDK's `env.budget().reset_default()` and `env.budget().instructions_consumed()` to measure the exact instruction count of each operation in isolation. Each benchmark:

1. Sets up a fresh environment with deployed contracts
2. Resets the budget immediately before the operation under test
3. Reads the consumed instruction count after the call
4. Asserts the count is within the allowed threshold

## Load Testing

Instruction count budgets cover on-chain cost, but they do not tell us how the RPC layer behaves under a traffic spike (for example, during a high-profile vote). Load tests exercise the deployed testnet contracts end-to-end through the RPC endpoint using [k6](https://k6.io/).

### SLO Thresholds

Every load test run is gated on the following service-level objectives:

| Metric | Threshold |
|--------|-----------|
| p95 response time | < 2 s |
| Error rate | < 1% |

The thresholds are defined once in `loadtest/config.js` and imported by each scenario, so the k6 `thresholds` block fails the run (non-zero exit code) if either SLO is breached.

### Scenarios

The k6 scripts live in `loadtest/`:

- `loadtest/proposal-fetch.js` — reads proposals via the RPC `getLedgerEntries` / simulation path, exercising the proposal fetch flow.
- `loadtest/vote-submit.js` — builds, simulates and submits `cast_vote` transactions, exercising the vote submit flow.
- `loadtest/config.js` — shared configuration: RPC URL, contract IDs, funded test accounts, SLO thresholds and scenario stages.

Each scenario is tagged (`flow:proposal_fetch`, `flow:vote_submit`) so results can be broken down per flow.

### Running Locally

Point the scripts at a testnet RPC endpoint and a set of funded test accounts:

```bash
export RPC_URL=https://soroban-testnet.stellar.org
export GOVERNANCE_CONTRACT_ID=<contract-id>
export TEST_ACCOUNTS=<secret-key-1>,<secret-key-2>
k6 run loadtest/proposal-fetch.js
k6 run loadtest/vote-submit.js
```

Results are written to `loadtest/results/` as a JSON summary (`--summary-export`) and as a k6 JSON stream, so they can be inspected or compared locally.

### Scheduled CI Workflow

The `loadtest` job in `.github/workflows/loadtest.yml` runs the scenarios against testnet on a schedule (nightly via `cron`) and can also be triggered manually with `workflow_dispatch`. The job:

1. Installs k6
2. Runs each scenario with `--summary-export` and `--out json`
3. Uploads the result files as CI artefacts
4. Compares the run against the previous baseline and fails on regression

### Artefacts and Baseline Comparison

Each run uploads its result files as a workflow artefact named `loadtest-results-<run-id>`, retained per the repository's artefact retention policy. The latest successful run's summary is also committed/published as the baseline (`loadtest/baseline.json`).

A comparison step (`loadtest/compare.js`) diffs the current run against the baseline:

- p95 response time must not regress beyond the SLO (and beyond a small tolerance versus the previous run)
- error rate must remain under 1%
- any breach fails the workflow, surfacing RPC bottlenecks before they reach production
=======
