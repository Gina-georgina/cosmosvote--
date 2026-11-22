import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Keypair } from '@stellar/stellar-sdk';
import { createFaucetServer, FaucetClaimStore, type FaucetConfig } from '../src/faucet';
import { logger } from '../src/logger';

describe('FaucetClaimStore', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cosmosvote-faucet-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('allows one claim and returns the cooldown expiry for duplicates', () => {
    const store = new FaucetClaimStore(join(directory, 'claims.sqlite'));
    const now = 1_800_000_000_000;

    expect(store.reserve('GTESTWALLET', now)).toBeNull();
    expect(store.reserve('GTESTWALLET', now + 1)).toBe(now + 24 * 60 * 60 * 1000);
    store.close();
  });

  it('retains cooldowns across database reopen and expires them after 24 hours', () => {
    const path = join(directory, 'claims.sqlite');
    const now = 1_800_000_000_000;
    const first = new FaucetClaimStore(path);
    first.reserve('GTESTWALLET', now);
    first.close();

    const reopened = new FaucetClaimStore(path);
    expect(reopened.reserve('GTESTWALLET', now + 10)).toBe(now + 24 * 60 * 60 * 1000);
    expect(reopened.reserve('GTESTWALLET', now + 24 * 60 * 60 * 1000)).toBeNull();
    reopened.close();
  });

  it('releases a reservation when minting fails before submission', () => {
    const store = new FaucetClaimStore(join(directory, 'claims.sqlite'));
    const now = 1_800_000_000_000;

    store.reserve('GTESTWALLET', now);
    store.release('GTESTWALLET', now);
    expect(store.reserve('GTESTWALLET', now + 1)).toBeNull();
    store.close();
  });
});

describe('faucet endpoint', () => {
  let directory: string;
  let store: FaucetClaimStore;
  let server: ReturnType<typeof createFaucetServer>;
  let baseUrl: string;
  const mint = jest.fn(async () => 'a'.repeat(64));
  const config: FaucetConfig = {
    allowedOrigin: 'https://app.example',
    databasePath: ':memory:',
    tokenContractId: 'C'.repeat(56),
    adminSecretKey: 'not-used-by-mock',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    amount: 1_000_000_000n,
    tokenDecimals: 7,
  };

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cosmosvote-faucet-api-'));
    store = new FaucetClaimStore(join(directory, 'claims.sqlite'));
    mint.mockClear();
    server = createFaucetServer(config, store, mint);
    await new Promise<void>(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('mints once and returns the amount and Stellar Expert transaction link', async () => {
    const address = Keypair.random().publicKey();
    const request = () => fetch(`${baseUrl}/api/faucet/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: config.allowedOrigin },
      body: JSON.stringify({ address }),
    });

    const response = await request();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      amount: '100',
      symbol: 'VOTE',
      transactionHash: 'a'.repeat(64),
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${'a'.repeat(64)}`,
    });

    const duplicate = await request();
    expect(duplicate.status).toBe(429);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-origin request before minting', async () => {
    const response = await fetch(`${baseUrl}/api/faucet/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify({ address: Keypair.random().publicKey() }),
    });

    expect(response.status).toBe(403);
    expect(mint).not.toHaveBeenCalled();
  });
});

describe('faucet structured logging', () => {
  let directory: string;
  let store: FaucetClaimStore;
  let server: ReturnType<typeof createFaucetServer>;
  let baseUrl: string;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const mint = jest.fn(async () => 'a'.repeat(64));
  const config: FaucetConfig = {
    allowedOrigin: 'https://app.example',
    databasePath: ':memory:',
    tokenContractId: 'C'.repeat(56),
    adminSecretKey: 'not-used-by-mock',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    amount: 1_000_000_000n,
    tokenDecimals: 7,
  };

  const claim = (address: string) => fetch(`${baseUrl}/api/faucet/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: config.allowedOrigin },
    body: JSON.stringify({ address }),
  });

  const claimLogs = () => [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
    .map(([fields]) => fields)
    .filter(fields => fields && typeof fields === 'object' && 'outcome' in fields);

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cosmosvote-faucet-log-'));
    store = new FaucetClaimStore(join(directory, 'claims.sqlite'));
    mint.mockClear();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined as never);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined as never);
    server = createFaucetServer(config, store, mint);
    await new Promise<void>(resolve => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('emits a structured success log with a hashed wallet and timestamp', async () => {
    const address = Keypair.random().publicKey();
    const response = await claim(address);
    expect(response.status).toBe(200);

    const logs = claimLogs();
    expect(logs).toHaveLength(1);
    const [entry] = logs;
    expect(entry.outcome).toBe('success');
    expect(typeof entry.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    expect(typeof entry.wallet).toBe('string');
    expect(entry.wallet).not.toBe(address);
    expect(entry.wallet).not.toContain(address);
    expect(entry.wallet).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits a structured rate-limit log with a hashed wallet and timestamp', async () => {
    const address = Keypair.random().publicKey();
    expect((await claim(address)).status).toBe(200);
    expect((await claim(address)).status).toBe(429);

    const logs = claimLogs();
    expect(logs).toHaveLength(2);
    const rateLimited = logs[1];
    expect(rateLimited.outcome).toBe('rate_limited');
    expect(typeof rateLimited.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(rateLimited.timestamp))).toBe(false);
    expect(rateLimited.wallet).not.toBe(address);
    expect(rateLimited.wallet).not.toContain(address);
    expect(rateLimited.wallet).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimited.wallet).toBe(logs[0].wallet);
  });

  it('emits a structured failure log when minting fails', async () => {
    mint.mockRejectedValueOnce(new Error('rpc unavailable'));
    const address = Keypair.random().publicKey();
    const response = await claim(address);
    expect(response.status).toBe(500);

    const logs = claimLogs();
    expect(logs).toHaveLength(1);
    const [entry] = logs;
    expect(entry.outcome).toBe('failure');
    expect(typeof entry.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
    expect(entry.wallet).not.toBe(address);
    expect(entry.wallet).not.toContain(address);
    expect(entry.wallet).toMatch(/^[0-9a-f]{64}$/);
  });
});