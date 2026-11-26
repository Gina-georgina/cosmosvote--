/**
 * requestTimeout.ts — request timeout middleware.
 *
 * Long-running or stalled requests can hold HTTP connections open
 * indefinitely, eventually exhausting the server's connection pool.
 * Wrap a request handler with `withRequestTimeout` to abort a request
 * that hasn't finished within the configured timeout, responding with
 * a 503 Service Unavailable problem+json body.
 *
 * Configurable via the REQUEST_TIMEOUT_MS env var (default: 30000).
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { sendProblem, PROBLEM_TYPES } from './problemJson';

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function getRequestTimeoutMs(): number {
  const raw = process.env.REQUEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

/**
 * Wraps an http request handler so that if it does not finish (i.e. the
 * response is not ended) within `timeoutMs`, the client receives a 503
 * problem+json response and the underlying connection is destroyed.
 */
export function withRequestTimeout(
  handler: RequestHandler,
  timeoutMs: number = getRequestTimeoutMs(),
): RequestHandler {
  return (req: IncomingMessage, res: ServerResponse): void => {
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (!res.headersSent && !res.writableEnded) {
        sendProblem(res, req, {
          type: PROBLEM_TYPES.requestTimeout,
          title: 'Request Timeout',
          status: 503,
          detail: `The request did not complete within ${timeoutMs}ms.`,
        });
      }
      // Ensure the underlying socket is released even if headers were
      // already partially sent by the time the timeout fired.
      req.socket?.destroy();
    }, timeoutMs);

    res.once('finish', () => clearTimeout(timer));
    res.once('close', () => clearTimeout(timer));

    void Promise.resolve(handler(req, res)).catch((err) => {
      clearTimeout(timer);
      if (!timedOut && !res.headersSent && !res.writableEnded) {
        sendProblem(res, req, {
          type: PROBLEM_TYPES.internal,
          title: 'Internal Server Error',
          status: 500,
          detail: err instanceof Error ? err.message : 'Unexpected error.',
        });
      }
    });
  };
}
