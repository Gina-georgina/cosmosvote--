import { FaucetClaimStore, createFaucetServer, readFaucetConfig } from './faucet';
import { isOriginAllowed } from './cors';

const config = readFaucetConfig(process.env);
if (!config) throw new Error('Set FAUCET_ENABLED=true to start the faucet service.');

const port = Number(process.env.FAUCET_PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('FAUCET_PORT must be a valid TCP port.');
}

async function main(): Promise<void> {
  const store = new FaucetClaimStore(config.databasePath);

  try {
    await store.initialize();
  } catch (error) {
    console.error(
      `Faucet database unavailable at ${config.databasePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    try {
      store.close();
    } catch {
      // ignore close errors during failed startup
    }
    process.exit(1);
  }

  const server = createFaucetServer(config, store);
  server.listen(port, '0.0.0.0', () => {
    console.info(`Testnet token faucet listening on port ${port}`);
  });

  let shuttingDown = false;
  function shutdown(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      store.close();
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(
    `Failed to start faucet service: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});