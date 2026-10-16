/**
 * Type definitions for the keeper service
 */

export interface KeeperConfig {
  network: string;
  rpcUrl: string;
  governanceContractId: string;
  keeperSecretKey: string;
  pollIntervalMinutes: number;
  logLevel: string;
  alerts: AlertConfig;
}

export interface AlertConfig {
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  email?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface Proposal {
  id: bigint;
  proposer: string;
  title: string;
  description: string;
  votes_yes: bigint;
  votes_no: bigint;
  votes_abstain: bigint;
  quorum: bigint;
  start_time: bigint;
  end_time: bigint;
  state: ProposalState;
}

export type ProposalState = 'Active' | 'Passed' | 'Rejected' | 'Executed' | 'Cancelled';

export interface FinalizationResult {
  proposalId: bigint;
  success: boolean;
  error?: string;
  txHash?: string;
}

export interface FinalizationReport {
  timestamp: Date;
  totalChecked: number;
  totalFinalized: number;
  successes: FinalizationResult[];
  failures: FinalizationResult[];
}
