/**
 * Environment variable schema validation using Zod.
 *
 * Call `loadEnv()` once at startup (before any other imports that read
 * process.env).  If any required variable is missing or invalid the process
 * exits immediately with a descriptive error listing every problem.
 *
 * Add new variables here and document them in backend/.env.example.
 */

import { z } from 'zod';

const envSchema = z.object({
  // ── Core service ──────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  APP_VERSION: z.string().optional(),

  // ── Build metadata (injected at build time) ───────────────────────────────
  VERSION: z.string().default('unknown'),

  COMMIT_SHA: z.string().default('unknown'),

  BUILD_DATE: z.string().default('unknown'),

  // ── Stellar / contract ────────────────────────────────────────────────────
  STELLAR_RPC_URL: z.string().url().default('http://localhost:8000'),

  GOVERNANCE_CONTRACT_ID: z.string().min(1, 'GOVERNANCE_CONTRACT_ID is required'),

  TOKEN_CONTRACT_ID: z.string().min(1).optional(),

  ALLOWED_CONTRACT_IDS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [],
    ),

  WEBHOOK_URL: z.string().url('WEBHOOK_URL must be a valid URL'),

  POLL_INTERVAL_MS: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 6_000))
    .refine((n) => Number.isInteger(n) && n > 0, 'POLL_INTERVAL_MS must be a positive integer'),

  // ── Health server ─────────────────────────────────────────────────────────
  HEALTH_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 8080))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 65535, 'HEALTH_PORT must be 1–65535'),

  // ── Error tracking ────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),

  // ── CORS ──────────────────────────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().optional(),

  // ── Audit log ─────────────────────────────────────────────────────────────
  AUDIT_LOG_PATH: z
    .string()
    .min(1, 'AUDIT_LOG_PATH must not be empty')
    .default('./data/audit.log'),

  // ── Faucet ────────────────────────────────────────────────────────────────
  FAUCET_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  // Path to a file containing the faucet signing keypair secret.
  FAUCET_SECRET_KEY_FILE: z.string().min(1).optional(),

  // AWS Secrets Manager secret id/ARN holding the faucet signing keypair.
  FAUCET_SECRET_KEY_AWS_SECRET_ID: z.string().min(1).optional(),

  // Deprecated: raw secret in env var, supported for local dev only.
  FAUCET_SECRET_KEY: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.FAUCET_ENABLED !== 'true') return;

  const sources = [
    env.FAUCET_SECRET_KEY_FILE,
    env.FAUCET_SECRET_KEY_AWS_SECRET_ID,
    env.FAUCET_SECRET_KEY,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (sources.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FAUCET_SECRET_KEY_FILE'],
      message:
        'FAUCET_ENABLED is true but no faucet secret source is configured. ' +
        'Set exactly one of FAUCET_SECRET_KEY_FILE, FAUCET_SECRET_KEY_AWS_SECRET_ID, ' +
        'or FAUCET_SECRET_KEY (deprecated, local dev only).',
    });
  } else if (sources.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FAUCET_SECRET_KEY_FILE'],
      message:
        'Multiple faucet secret sources are configured. ' +
        'Set exactly one of FAUCET_SECRET_KEY_FILE, FAUCET_SECRET_KEY_AWS_SECRET_ID, ' +
        'or FAUCET_SECRET_KEY (deprecated, local dev only).',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Build the set of contract IDs that subscriptions may target.
 *
 * Always includes GOVERNANCE_CONTRACT_ID, plus TOKEN_CONTRACT_ID (if set)
 * and any additional IDs listed in ALLOWED_CONTRACT_IDS.
 */
export function getAllowedContractIds(env: Env): Set<string> {
  const ids = new Set<string>([env.GOVERNANCE_CONTRACT_ID]);

  if (env.TOKEN_CONTRACT_ID) {
    ids.add(env.TOKEN_CONTRACT_ID);
  }

  for (const id of env.ALLOWED_CONTRACT_IDS) {
    ids.add(id);
  }

  return ids;
}

/**
 * Validate process.env against the schema.
 * Exits the process on failure so startup fails fast with a clear message.
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    process.stderr.write(
      `[cosmosvote-backend] Invalid environment configuration — startup aborted.\n${issues}\n`,
    );
    process.exit(1);
  }

  return result.data;
}
