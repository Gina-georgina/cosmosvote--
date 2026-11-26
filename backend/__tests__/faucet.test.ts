import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Keypair } from '@stellar/stellar-sdk';
import {
  createFaucetServer,
  FaucetClaimStore,
  readFaucetConfig,
  resolveFaucetSecretKey,
  type FaucetConfig,
} from '../src/faucet';

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

describe('faucet secret resolution', () => {
  const secret = Keypair.random().secret();
  let directory: string;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cosmosvote-faucet-secret-'));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reads and trims the key from FAUCET_SECRET_KEY_FILE', () => {
    const path = join(directory, 'faucet.key');
    writeFileSync(path, `  ${secret}\n`);

    expect(resolveFaucetSecretKey({ FAUCET_SECRET_KEY_FILE: path })).toBe(secret);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to FAUCET_SECRET_KEY with exactly one deprecation warning', () => {
    expect(resolveFaucetSecretKey({ FAUCET_SECRET_KEY: secret })).toBe(secret);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/deprecat/i);
    expect(warn.mock.calls[0][0]).not.toContain(secret);
  });

  it('throws when multiple sources are configured without leaking the secret', () => {
    const path = join(directory, 'faucet.key');
    writeFileSync(path, secret);

    let error: unknown;
    try {
      resolveFaucetSecretKey({ FAUCET_SECRET_KEY_FILE: path, FAUCET_SECRET_KEY: secret });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secret);
  });

  it('throws when no source is configured', () => {
    expect(() => resolveFaucetSecretKey({})).toThrow(/FAUCET_SECRET_KEY_FILE/);
  });

  it('reads a file-based config and fails when the file is missing', () => {
    const path = join(directory, 'faucet.key');
    writeFileSync(path, secret);
    const env = {
      FAUCET_SECRET_KEY_FILE: path,
      FAUCET_ALLOWED_ORIGIN: 'https://app.example',
      FAUCET_DATABASE_PATH: join(directory, 'claims.sqlite'),
      FAUCET_TOKEN_CONTRACT_ID: 'C'.repeat(56),
      FAUCET_RPC_URL: 'https://soroban-testnet.stellar.org',
    };

    const config = readFaucetConfig(env);
    expect(config.adminSecretKey).toBe(secret);

    let error: unknown;
    try {
      readFaucetConfig({ ...env, FAUCET_SECRET_KEY_FILE: join(directory, 'missing.key') });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(secret);
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