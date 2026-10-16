#!/usr/bin/env node
/**
 * Keeper service entry point
 * 
 * Automatically finalizes expired governance proposals every 10 minutes.
 * 
 * Usage:
 *   npm run dev        # Development mode with ts-node
 *   npm run build      # Build to dist/
 *   npm start          # Run compiled version
 * 
 * Environment variables (see .env.example):
 *   NETWORK, SOROBAN_RPC_URL, GOVERNANCE_CONTRACT_ID, KEEPER_SECRET_KEY, etc.
 */

import { loadConfig } from './config';
import { KeeperService } from './keeper';

async function main() {
  console.log('CosmosVote Keeper Service');
  console.log('=========================\n');

  try {
    const config = loadConfig();
    const keeper = new KeeperService(config);
    await keeper.run();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down keeper service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down keeper service...');
  process.exit(0);
});

main();
