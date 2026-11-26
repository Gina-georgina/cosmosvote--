import { loadEnv } from './env';
import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { createHealthServer } from './health';
import { NotificationService } from './notificationService';
import { logger } from './logger';
import helmet from 'helmet';
import compression from 'compression';

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

// Response compression middleware. Negotiates gzip/brotli via the client's
// Accept-Encoding header, only compresses bodies larger than 1 KB, and skips
// already-compressed binary content types (images, zip, etc.).
const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    if (typeof contentType === 'string') {
      const type = contentType.toLowerCase();
      const alreadyCompressed = [
        'image/',
        'video/',
        'audio/',
        'application/zip',
        'application/gzip',
        'application/x-gzip',
        'application/x-compress',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/octet-stream',
      ];
      if (alreadyCompressed.some((prefix) => type.startsWith(prefix))) {
        return false;
      }
    }
    // Fall back to the default filter (respects Accept-Encoding, skips HEAD, etc.).
    return compression.filter(req, res);
  },
});

const healthServer = createHealthServer(
  () => service.checkReadiness(),
  securityHeaders,
  compressionMiddleware,
);
const healthPort = env.HEALTH_PORT;
healthServer.listen(healthPort, '0.0.0.0', () => {
  console.info(`[cosmosvote-backend] health endpoints listening on port ${healthPort}`);
});

service.start();
logger.info({ event: 'startup' }, 'notification service started');

// Maximum time to wait for in-flight HTTP requests to finish before forcing
// the process to exit. Prevents a stuck connection from blocking shutdown
// indefinitely (e.g. during a rolling deploy or container restart).
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10000);

function closeServerWithTimeout(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logger.warn(
        { event: 'shutdown_timeout', timeoutMs },
        'forcing shutdown: in-flight requests did not complete in time'
      );
      resolve();
    }, timeoutMs);

    healthServer.close(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
  });
}

async function shutdown() {
  logger.info({ event: 'shutdown' }, 'notification service stopping');
  service.stop();
  await closeServerWithTimeout(SHUTDOWN_TIMEOUT_MS);
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);