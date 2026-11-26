import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import encoding from 'k6/encoding';

// ---------------------------------------------------------------------------
// Configuration via environment variables
// ---------------------------------------------------------------------------
const RPC_URL = __ENV.RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  __ENV.NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const CONTRACT_ID = __ENV.CONTRACT_ID || '';
const VOTE_FUNCTION = __ENV.VOTE_FUNCTION || 'vote';
const PROPOSAL_ID = __ENV.PROPOSAL_ID || '1';
const VOTE_OPTION = __ENV.VOTE_OPTION || '1';

// Test accounts are supplied as a JSON array of { secret, publicKey } objects.
// Example: TEST_ACCOUNTS='[{"secret":"S...","publicKey":"G..."}]'
const TEST_ACCOUNTS = parseAccounts(__ENV.TEST_ACCOUNTS);

// Load profile is configurable so the same script can be reused for
// smoke tests and full scheduled load runs.
const VUS = parseInt(__ENV.VUS || '10', 10);
const DURATION = __ENV.DURATION || '1m';

function parseAccounts(raw) {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('TEST_ACCOUNTS must be a JSON array');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse TEST_ACCOUNTS: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const voteSubmitDuration = new Trend('vote_submit_duration', true);
const voteSubmitSuccess = new Rate('vote_submit_success');

// ---------------------------------------------------------------------------
// k6 options: SLO thresholds per issue #491
//   - p95 response time < 2s
//   - error rate < 1%
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    vote_submit: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION,
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
    vote_submit_duration: ['p(95)<2000'],
    vote_submit_success: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rpcCall(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  });
  return http.post(RPC_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { rpc_method: method },
  });
}

function accountForVu() {
  if (TEST_ACCOUNTS.length === 0) {
    return null;
  }
  return TEST_ACCOUNTS[__VU % TEST_ACCOUNTS.length];
}

// Build a minimal Soroban invoke transaction envelope. In a real load test
// the transaction is prepared and signed off-band; here we construct the
// request shape expected by the RPC and rely on the testnet to validate it.
function buildInvokeTransaction(account) {
  const now = Math.floor(Date.now() / 1000);
  return {
    source_account: account.publicKey,
    fee: '100',
    seq_num: String(now),
    cond: { time: { min_time: '0', max_time: '0' } },
    memo: { type: 'none' },
    operations: [
      {
        type: 'invoke_host_function',
        function: VOTE_FUNCTION,
        contract_id: CONTRACT_ID,
        args: [
          { type: 'u64', value: PROPOSAL_ID },
          { type: 'u32', value: VOTE_OPTION },
        ],
      },
    ],
    signatures: [],
    network_passphrase: NETWORK_PASSPHRASE,
  };
}

// ---------------------------------------------------------------------------
// Default VU function: submit a vote
// ---------------------------------------------------------------------------
export default function () {
  const account = accountForVu();
  if (!account) {
    throw new Error('No TEST_ACCOUNTS configured for vote submit load test');
  }

  const tx = buildInvokeTransaction(account);
  const start = Date.now();

  const res = rpcCall('sendTransaction', {
    transaction: encoding.b64encode(JSON.stringify(tx)),
  });

  const elapsed = Date.now() - start;
  voteSubmitDuration.add(elapsed);

  const ok = check(res, {
    'sendTransaction status is 200': (r) => r.status === 200,
    'sendTransaction has no rpc error': (r) => {
      if (r.status !== 200) {
        return false;
      }
      try {
        const body = r.json();
        return !body.error;
      } catch (e) {
        return false;
      }
    },
  });

  voteSubmitSuccess.add(ok);

  // Small think time to avoid hammering the RPC in a tight loop.
  sleep(0.5);
}

// ---------------------------------------------------------------------------
// JSON summary export for CI artefact storage and run-over-run comparison.
// The workflow invokes k6 with --summary-export pointing at a file path.
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const summary = {
    generated_at: new Date().toISOString(),
    target: {
      rpc_url: RPC_URL,
      contract_id: CONTRACT_ID,
      network_passphrase: NETWORK_PASSPHRASE,
      proposal_id: PROPOSAL_ID,
      vote_option: VOTE_OPTION,
    },
    load_profile: {
      vus: VUS,
      duration: DURATION,
    },
    metrics: data.metrics,
    thresholds: data.root_group
      ? Object.fromEntries(
          Object.entries(data.metrics)
            .filter(([, m]) => m.thresholds)
            .map(([name, m]) => [name, m.thresholds]),
        )
      : {},
  };

  const out = {};
  out['stdout'] = JSON.stringify(summary, null, 2) + '\n';
  if (__ENV.SUMMARY_EXPORT) {
    out[__ENV.SUMMARY_EXPORT] = JSON.stringify(summary, null, 2);
  }
  return out;
}