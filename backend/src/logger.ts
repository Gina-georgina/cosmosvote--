/**
 * Structured JSON logger using pino.
 *
 * Features:
 *   - JSON output suitable for production log aggregators (Datadog, Loki, etc.)
 *   - Log level controlled by LOG_LEVEL env var (default: "info")
 *   - Every entry includes timestamp, service name, and optional traceId
 *   - Sensitive fields (webhookUrl, email, secret keys) are redacted
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info({ traceId: '...', event: 'proposal_created' }, 'New proposal');
 *   logger.error({ err }, 'Poll failed');
 *   logger.child({ traceId }).info('...');
 */

import pino from 'pino';

/**
 * Fields that must never appear in plain text in log output.
 * pino redactFields replaces the values with "[Redacted]".
 */
const REDACTED_FIELDS = [
  'webhookUrl',
  'email',
  'emailAddress',
  'secretKey',
  'STELLAR_SECRET_KEY',
  'password',
  'token',
  'apiKey',
  'authorization',
  'dsn',
];

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

export const logger = pino({
  level: LOG_LEVEL,
  base: {
    service: 'cosmosvote-backend',
    pid: process.pid,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACTED_FIELDS,
    censor: '[Redacted]',
  },
  // Produce valid JSON even when piped through pretty-printers in dev
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/**
 * Create a child logger pre-bound with a traceId.
 * Use this at the start of each request or async operation.
 *
 * @example
 *   const log = childLogger(traceId);
 *   log.info('Starting poll cycle');
 */
export function childLogger(traceId: string): pino.Logger {
  return logger.child({ traceId });
}
