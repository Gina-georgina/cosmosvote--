import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { NotificationService } from './notificationService';
import { logger } from './logger';

// Must be called before any async work so unhandled rejections are captured.
initErrorTracking();

const service = new NotificationService({
  rpcUrl: process.env.STELLAR_RPC_URL ?? 'http://localhost:8000',
  contractId: process.env.GOVERNANCE_CONTRACT_ID ?? '',
  webhookUrl: process.env.WEBHOOK_URL ?? '',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 6_000),
});

service.start();
logger.info({ event: 'startup' }, 'notification service started');

async function shutdown() {
  logger.info({ event: 'shutdown' }, 'notification service stopping');
  service.stop();
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
