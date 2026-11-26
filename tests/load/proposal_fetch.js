import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Configuration via environment variables
// ---------------------------------------------------------------------------
// Required:
//   TESTNET_RPC_URL   - Base URL of the testnet RPC endpoint
//                       (e.g. https://rpc.testnet.example.org)
//   CONTRACT_ID       - The governance contract ID to fetch proposals from
// Optional:
//   PROPOSAL_IDS      - Comma-separated list of proposal IDs to fetch.
//                       Defaults to a small synthetic range if unset.
//   VUS               - Number of virtual users (default: 10)
//   DURATION          - Test duration (default: 1m)
//   RAMP_UP           - Ramp-up duration (default: 10s)
//   REQUEST_TIMEOUT   - Per-request timeout (default: 10s)
// ---------------------------------------------------------------------------

const RPC_URL = __ENV.TESTNET_RPC_URL || 'http://localhost:8000';
const CONTRACT_ID = __ENV.CONTRACT_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '10s';

const PROPOSAL_IDS = (__ENV.PROPOSAL_IDS || '1,2,3,4,5')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '1m';
const RAMP_UP = __ENV.RAMP_UP || '10s';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const proposalFetchErrors = new Rate('proposal_fetch_errors');
const proposalFetchDuration = new Trend('proposal_fetch_duration', true);

// ---------------------------------------------------------------------------
// k6 options: SLO thresholds (issue #491)
//   - p95 response time < 2 s
//   - error rate < 1%
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    proposal_fetch: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: RAMP_UP, target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // SLO: p95 response time under 2 seconds
    http_req_duration: ['p(95)<2000'],
    // SLO: error rate under 1%
    http_req_failed: ['rate<0.01'],
    // Flow-specific SLOs
    proposal_fetch_duration: ['p(95)<2000'],
    proposal_fetch_errors: ['rate<0.01'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function rpcUrl(path) {
  return `${RPC_URL.replace(/\/+$/, '')}${path}`;
}

/**
 * Fetch a single proposal by ID from the governance contract.
 * Uses the Soroban RPC `getContractData` style invocation via a simulated
 * contract call. Adjust the payload to match the deployed contract ABI.
 */
function fetchProposal(proposalId) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: `fetch-proposal-${proposalId}`,
    method: 'simulateTransaction',
    params: {
      transaction: {
        // Minimal envelope; the RPC node resolves the contract call.
        contractId: CONTRACT_ID,
        function: 'get_proposal',
        args: [{ type: 'u64', value: String(proposalId) }],
      },
    },
  });

  const res = http.post(rpcUrl('/'), payload, {
    headers: buildHeaders(),
    timeout: REQUEST_TIMEOUT,
    tags: { flow: 'proposal_fetch', proposal_id: String(proposalId) },
  });

  const ok = check(res, {
    'proposal fetch status is 200': (r) => r.status === 200,
    'proposal fetch returns body': (r) => r.body && r.body.length > 0,
    'proposal fetch has no RPC error': (r) => {
      if (r.status !== 200) return false;
      try {
        const body = JSON.parse(r.body);
        return !body.error;
      } catch (_e) {
        return false;
      }
    },
  });

  proposalFetchErrors.add(!ok);
  proposalFetchDuration.add(res.timings.duration);

  return res;
}

// ---------------------------------------------------------------------------
// Default function: executed by each virtual user on every iteration
// ---------------------------------------------------------------------------
export default function () {
  const proposalId = PROPOSAL_IDS[Math.floor(Math.random() * PROPOSAL_IDS.length)];
  fetchProposal(proposalId);

  // Small think-time to emulate realistic client behaviour.
  sleep(Math.random() * 0.5 + 0.1);
}

// ---------------------------------------------------------------------------
// Summary export: write a JSON summary for CI artefact storage and
// comparison against the previous run.
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = {
    generatedAt: new Date().toISOString(),
    flow: 'proposal_fetch',
    config: {
      rpcUrl: RPC_URL,
      contractId: CONTRACT_ID,
      proposalIds: PROPOSAL_IDS,
      vus: VUS,
      duration: DURATION,
      rampUp: RAMP_UP,
    },
    thresholds: data.metrics ? extractThresholds(data) : {},
    metrics: data.metrics || {},
  };

  return {
    // Human-readable summary to stdout.
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    // Machine-readable artefact for CI storage/comparison.
    [`load-results/proposal_fetch-${timestamp}.json`]: JSON.stringify(summary, null, 2),
    // Stable filename for "latest" comparison.
    'load-results/proposal_fetch-latest.json': JSON.stringify(summary, null, 2),
  };
}

function extractThresholds(data) {
  const result = {};
  for (const [name, metric] of Object.entries(data.metrics || {})) {
    if (metric.thresholds) {
      result[name] = {};
      for (const [expr, t] of Object.entries(metric.thresholds)) {
        result[name][expr] = { ok: t.ok };
      }
    }
  }
  return result;
}

// Minimal text summary (avoids depending on k6's internal summary module).
function textSummary(data, opts) {
  const indent = (opts && opts.indent) || '';
  const lines = [];
  lines.push(`${indent}proposal_fetch load test summary`);
  lines.push(`${indent}--------------------------------`);
  const metrics = data.metrics || {};
  for (const key of [
    'http_reqs',
    'http_req_duration',
    'http_req_failed',
    'proposal_fetch_duration',
    'proposal_fetch_errors',
    'iterations',
    'vus',
  ]) {
    const m = metrics[key];
    if (!m) continue;
    const values = m.values || {};
    const parts = Object.entries(values)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(' ');
    lines.push(`${indent}${key}: ${parts}`);
  }
  return lines.join('\n') + '\n';
}