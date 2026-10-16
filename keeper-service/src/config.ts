/**
 * Configuration loader for keeper service
 */
import { KeeperConfig } from './types';

export function loadConfig(): KeeperConfig {
  const network = process.env.NETWORK || 'testnet';
  const rpcUrl = process.env.SOROBAN_RPC_URL;
  const governanceContractId = process.env.GOVERNANCE_CONTRACT_ID;
  const keeperSecretKey = process.env.KEEPER_SECRET_KEY;
  const pollIntervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES || '10', 10);
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!rpcUrl) {
    throw new Error('SOROBAN_RPC_URL is required');
  }
  if (!governanceContractId) {
    throw new Error('GOVERNANCE_CONTRACT_ID is required');
  }
  if (!keeperSecretKey) {
    throw new Error('KEEPER_SECRET_KEY is required');
  }

  return {
    network,
    rpcUrl,
    governanceContractId,
    keeperSecretKey,
    pollIntervalMinutes,
    logLevel,
    alerts: {
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
      email: process.env.ALERT_EMAIL,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    },
  };
}
