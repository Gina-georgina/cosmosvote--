/**
 * problemJson.ts — RFC 7807 "Problem Details for HTTP APIs" helper.
 *
 * All error responses from the backend should use this helper so clients
 * get a consistent, machine-parseable `application/problem+json` body:
 *   { type, title, status, detail, instance }
 *
 * See docs/errors.md for the documented error catalogue.
 */

import type { ServerResponse, IncomingMessage } from 'http';

export interface ProblemDetails {
  /** A URI identifying the problem type. Defaults to "about:blank". */
  type?: string;
  /** Short, human-readable summary of the problem type. */
  title: string;
  /** HTTP status code. */
  status: number;
  /** Human-readable explanation specific to this occurrence. */
  detail?: string;
  /** URI identifying the specific occurrence of the problem. */
  instance?: string;
}

/** Write an RFC 7807 problem+json response and end it. */
export function sendProblem(
  res: ServerResponse,
  req: IncomingMessage | undefined,
  problem: ProblemDetails,
): void {
  const body: Required<Omit<ProblemDetails, 'detail'>> & { detail?: string } = {
    type: problem.type ?? 'about:blank',
    title: problem.title,
    status: problem.status,
    instance: problem.instance ?? req?.url ?? 'unknown',
    ...(problem.detail !== undefined ? { detail: problem.detail } : {}),
  };

  res.setHeader('Content-Type', 'application/problem+json');
  res.writeHead(problem.status);
  res.end(JSON.stringify(body));
}

export const PROBLEM_TYPES = {
  notFound: 'https://cosmosvote.dev/errors/not-found',
  notReady: 'https://cosmosvote.dev/errors/not-ready',
  tooManyRequests: 'https://cosmosvote.dev/errors/too-many-requests',
  requestTimeout: 'https://cosmosvote.dev/errors/request-timeout',
  methodNotAllowed: 'https://cosmosvote.dev/errors/method-not-allowed',
  unauthorized: 'https://cosmosvote.dev/errors/unauthorized',
  internal: 'https://cosmosvote.dev/errors/internal',
} as const;
