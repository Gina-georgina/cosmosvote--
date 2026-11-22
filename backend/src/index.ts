import { loadEnv } from './env';
import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { createHealthServer } from './health';
import { NotificationService } from './notificationService';
import { logger } from './logger';
import helmet from 'helmet';
import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// Validate env vars before anything else — fails fast with a clear message.
const env = loadEnv();

// Must be called before any async work so unhandled rejections are captured.
initErrorTracking();

// Initialize the append-only audit log for admin operations.
auditLogger.init({ logPath: env.AUDIT_LOG_PATH });

const service = new NotificationService({
  rpcUrl: env.STELLAR_RPC_URL,
  contractId: env.GOVERNANCE_CONTRACT_ID,
  webhookUrl: env.WEBHOOK_URL,
  pollIntervalMs: env.POLL_INTERVAL_MS,
});

// Security headers middleware. Applied to every HTTP response.
// HTTPS-only enforcement: HSTS (max-age=31536000) instructs browsers to
// only use HTTPS for this host for one year. The API must be served over
// TLS (terminated at the load balancer / reverse proxy) for HSTS to take
// effect; plain-HTTP deployments should redirect to HTTPS upstream.
const securityHeaders = helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin' },
});

// Admin bearer-token authentication.
// Compares the presented token against ADMIN_TOKEN using a constant-time
// comparison so attackers cannot infer the token via response timing.
export function isAdminTokenValid(
  presented: string | undefined,
  expected: string | undefined,
): boolean {
  if (!presented || !expected) return false;
  const presentedBuf = Buffer.from(presented, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  // timingSafeEqual requires equal-length buffers; length mismatch is invalid.
  if (presentedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(presentedBuf, expectedBuf);
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
}

// Express-style middleware guarding all /admin/* routes.
export function adminAuthMiddleware(expectedToken: string | undefined) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const token = extractBearerToken(req);
    if (!isAdminTokenValid(token, expectedToken)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    next();
  };
}

// Minimal router for admin endpoints. All routes require a valid bearer token.
export function createAdminHandler(
  expectedToken: string | undefined,
  getDlqEntries: () => unknown[],
) {
  const auth = adminAuthMiddleware(expectedToken);
  return (req: IncomingMessage, res: ServerResponse): void => {
    auth(req, res, () => {
      const url = req.url ?? '';
      const path = url.split('?')[0];
      if (req.method === 'GET' && path === '/admin/dlq') {
        try {
          const entries = getDlqEntries();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ entries }));
        } catch (err) {
          logger.error({ event: 'admin_dlq_error', err }, 'failed to read DLQ');
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not Found' }));
    });
  };
}

const adminHandler = createAdminHandler(env.ADMIN_TOKEN, () => service.getDeadLetterEntries());

const healthServer = createHealthServer(
  () => service.checkReadiness(),
  securityHeaders,
  adminHandler,
);
const healthPort = env.HEALTH_PORT;
healthServer.listen(healthPort, '0.0.0.0', () => {
  console.info(`[cosmosvote-backend] health endpoints listening on port ${healthPort}`);
});

service.start();
logger.info({ event: 'startup' }, 'notification service started');

async function shutdown() {
  logger.info({ event: 'shutdown' }, 'notification service stopping');
  service.stop();
  healthServer.close();
  service.closeDeadLetterStore();
  await auditLogger.flush();
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);