/**
 * Error tracking integration using Sentry.
 *
 * Alert trigger conditions:
 *   - Unhandled promise rejections   → captured automatically via init()
 *   - Unhandled exceptions           → captured automatically via init()
 *   - Webhook delivery failures      → call captureError() with context
 *   - Event polling failures ≥ 3     → call captureError() with retry count
 *   - Any manually caught error      → call captureError() with breadcrumbs
 *
 * Set SENTRY_DSN (or ERROR_TRACKING_DSN) in the environment to enable.
 * If neither is set, errors are only logged locally (safe for local dev).
 *
 * Sensitive fields are scrubbed before any data leaves the process:
 *   - Authorization headers
 *   - Cookies
 *   - Any key matching /secret|password|token|key|dsn/i
 *
 * NOTE: SENTRY_DSN / ERROR_TRACKING_DSN are intentionally excluded from pino
 * log output via the redact config in logger.ts.
 */

import * as Sentry from '@sentry/node';
import { logger } from './logger';

/** Keys whose values must never be sent to the error tracker. */
const SCRUBBED_KEYS = /secret|password|token|key|dsn|authorization|cookie/i;

function buildBeforeSend(
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent | null {
  // Scrub request headers
  if (event.request?.headers) {
    for (const header of Object.keys(event.request.headers)) {
      if (SCRUBBED_KEYS.test(header)) {
        (event.request.headers as Record<string, string>)[header] = '[Scrubbed]';
      }
    }
    // Always scrub cookies
    delete event.request.cookies;
  }

  // Scrub extra context keys
  if (event.extra) {
    for (const k of Object.keys(event.extra)) {
      if (SCRUBBED_KEYS.test(k)) {
        event.extra[k] = '[Scrubbed]';
      }
    }
  }

  return event;
}

export function initErrorTracking(): void {
  // Support both SENTRY_DSN and the generic ERROR_TRACKING_DSN alias
  const dsn = process.env.SENTRY_DSN || process.env.ERROR_TRACKING_DSN;
  if (!dsn) {
    logger.warn(
      { event: 'error_tracking_disabled' },
      'ERROR_TRACKING_DSN / SENTRY_DSN not set — error tracking disabled, logging to stderr only',
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: 0.1,
    // Scrub sensitive data before sending
    beforeSend: buildBeforeSend,
  });

  // Capture any unhandled rejections or exceptions not caught elsewhere
  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });

  process.on('uncaughtException', (err) => {
    Sentry.captureException(err);
  });

  logger.info({ event: 'error_tracking_initialized' }, 'Error tracking initialised');
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : new Error(String(error));

  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }

  // Always log locally so operators see it even without a DSN configured.
  logger.error({ err, ...context }, err.message);
}

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  await Sentry.close(timeoutMs);
}
