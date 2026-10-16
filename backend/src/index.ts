import { initErrorTracking, flushErrorTracking } from './errorTracking';
import { createHealthServer } from './health';
import { NotificationService } from './notificationService';

// Must be called before any async work so unhandled rejections are captured.
initErrorTracking();

const service = new NotificationService({
  rpcUrl: process.env.STELLAR_RPC_URL ?? 'http://localhost:8000',
  contractId: process.env.GOVERNANCE_CONTRACT_ID ?? '',
  webhookUrl: process.env.WEBHOOK_URL ?? '',
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 6_000),
});

const healthServer = createHealthServer(() => service.checkReadiness());
const healthPort = Number(process.env.HEALTH_PORT ?? 8080);
healthServer.listen(healthPort, '0.0.0.0', () => {
  console.info(`[cosmosvote-backend] health endpoints listening on port ${healthPort}`);
});

service.start();
console.info('[cosmosvote-backend] notification service started');

async function shutdown() {
  service.stop();
  healthServer.close();
  await flushErrorTracking();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
