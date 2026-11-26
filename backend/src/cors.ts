/**
 * CORS middleware utility for the CosmosVote backend.
 *
 * Reads ALLOWED_ORIGINS from the environment as a comma-separated list of
 * origins.  If the env var is unset, no origin is allowed (restrictive
 * default — never a wildcard in production).
 *
 * Usage:
 *   import { corsHeaders, isOriginAllowed } from './cors';
 *   const allowed = isOriginAllowed(request.headers.origin);
 *   if (!allowed) { res.writeHead(403); res.end(); return; }
 *   corsHeaders(origin).forEach(([k, v]) => res.setHeader(k, v));
 */

/** True when running in production mode. */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Normalise an origin: lowercase and strip trailing slashes. */
function normaliseOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/** Parse ALLOWED_ORIGINS into a frozen Set of normalised origins. */
function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map(normaliseOrigin)
      .filter(Boolean),
  );
}

export const ALLOWED_ORIGINS: ReadonlySet<string> = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
);

/**
 * Returns true if the origin is in the allowlist.
 *
 * Matching is exact string equality against the allowlist Set (after
 * normalisation) — never prefix or substring matching, so spoofed origins
 * such as `https://cosmosvote.dev.evil.com` are rejected.
 *
 * Wildcards (`*`) are never honoured in production mode.
 */
export function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;
  const normalised = normaliseOrigin(origin);
  if (!normalised) return false;
  if (normalised === '*') return !isProduction();
  if (isProduction() && ALLOWED_ORIGINS.has('*')) return false;
  return ALLOWED_ORIGINS.has(normalised);
}

/** Returns the CORS response headers for an allowed origin. */
export function corsHeaders(
  origin: string,
): [string, string][] {
  return [
    ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Methods', 'POST, OPTIONS'],
    ['Access-Control-Allow-Headers', 'Content-Type'],
    ['Access-Control-Max-Age', '600'],
    ['Vary', 'Origin'],
  ];
}
