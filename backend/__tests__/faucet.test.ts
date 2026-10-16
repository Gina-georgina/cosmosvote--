import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Keypair } from '@stellar/stellar-sdk';
import { createFaucetServer, FaucetClaimStore, type FaucetConfig } from '../src/faucet';

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