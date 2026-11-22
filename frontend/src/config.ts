/// <reference types="vite/client" />
import type { NetworkConfig } from './types';

export const NETWORKS: Record<string, NetworkConfig> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    governanceContractId: import.meta.env.VITE_GOVERNANCE_CONTRACT_ID ?? '',
    tokenContractId: import.meta.env.VITE_TOKEN_CONTRACT_ID ?? '',
    treasuryContractId: import.meta.env.VITE_TREASURY_CONTRACT_ID ?? '',
  },
  mainnet: {
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    governanceContractId: import.meta.env.VITE_GOVERNANCE_CONTRACT_ID ?? '',
    tokenContractId: import.meta.env.VITE_TOKEN_CONTRACT_ID ?? '',
    treasuryContractId: import.meta.env.VITE_TREASURY_CONTRACT_ID ?? '',
  },
};

export const ACTIVE_NETWORK = (import.meta.env.VITE_NETWORK as string) ?? 'testnet';
export const config = NETWORKS[ACTIVE_NETWORK] ?? NETWORKS.testnet;

const EXPLORER_BASE: Record<string, string> = {
  testnet: 'https://stellar.expert/explorer/testnet',
  mainnet: 'https://stellar.expert/explorer/public',
};

export const explorerBase = EXPLORER_BASE[ACTIVE_NETWORK] ?? EXPLORER_BASE.testnet;

export function explorerAccountUrl(address: string): string {
  return `${explorerBase}/account/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${explorerBase}/tx/${hash}`;
}

export function truncateTxHash(hash: string, head = 6, tail = 6): string {
  if (!hash) return '';
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function validateConfig() {
  const errors: string[] = [];
  
  if (!config.governanceContractId || !config.governanceContractId.startsWith('C') || config.governanceContractId.length !== 56) {
    errors.push('VITE_GOVERNANCE_CONTRACT_ID must be a valid Stellar contract ID (starts with C, 56 characters).');
  }
  
  if (!config.tokenContractId || !config.tokenContractId.startsWith('C') || config.tokenContractId.length !== 56) {
    errors.push('VITE_TOKEN_CONTRACT_ID must be a valid Stellar contract ID (starts with C, 56 characters).');
  }

  if (errors.length > 0) {
    throw new Error('Configuration Error:\n' + errors.join('\n'));
  }
}
