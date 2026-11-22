import { loadEnv } from './env';
import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { createHealthServer } from './health';
import { NotificationService } from './notificationService';
import { logger } from './logger';
import { requestContext } from './requestContext';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
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

// Request-ID middleware. Generates (or echoes) a correlation ID per request,
// exposes it via AsyncLocalStorage so logger.ts can include it in every log
// line, and sets the `X-Request-Id` response header on every response.
export function requestIdMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId }, next);
}

const healthServer = createHealthServer(
  () => service.checkReadiness(),
  securityHeaders,
  requestIdMiddleware,
);
const healthPort = env.HEALTH_PORT;
healthServer.listen(healthPort, '0.0.0.0', () => {
  console.info(`[cosmosvote-backend] health endpoints listening on port ${healthPort}`);
});

service.start();
logger.info({ event: 'startup' }, 'notification service started');

export { requestContext };

async function shutdown() {
  logger.info({ event: 'shutdown' }, 'notification service stopping');
  service.stop();
  healthServer.close();
  await auditLogger.flush();
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);