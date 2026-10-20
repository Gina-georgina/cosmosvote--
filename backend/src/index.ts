import { loadEnv } from './env';
import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { createHealthServer } from './health';
import { NotificationService } from './notificationService';
import { logger } from './logger';

// Validate env vars before anything else — fails fast with a clear message.
const env = loadEnv();

// Must be called before any async work so unhandled rejections are captured.
initErrorTracking();

const service = new NotificationService({
  rpcUrl: env.STELLAR_RPC_URL,
  contractId: env.GOVERNANCE_CONTRACT_ID,
  webhookUrl: env.WEBHOOK_URL,
  pollIntervalMs: env.POLL_INTERVAL_MS,
});

const healthServer = createHealthServer(() => service.checkReadiness());
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
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
