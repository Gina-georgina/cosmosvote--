/**
 * Tests for environment variable schema validation.
 */

const REQUIRED = {
  GOVERNANCE_CONTRACT_ID: 'CAABC123',
  WEBHOOK_URL: 'https://hooks.example.com/notify',
};

function loadWithEnv(overrides: Record<string, string | undefined>) {
  // Isolate module so loadEnv re-parses process.env each call
  jest.resetModules();
  const saved: Record<string, string | undefined> = {};

  // Clear irrelevant vars that might bleed in
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return require('../src/env') as typeof import('../src/env');
  } finally {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }
}

describe('loadEnv', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Clear required vars
    delete process.env.GOVERNANCE_CONTRACT_ID;
    delete process.env.WEBHOOK_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('exits when required vars are missing', () => {
    const { loadEnv } = loadWithEnv({ GOVERNANCE_CONTRACT_ID: undefined, WEBHOOK_URL: undefined });
    loadEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('error message names each missing variable', () => {
    const { loadEnv } = loadWithEnv({ GOVERNANCE_CONTRACT_ID: undefined, WEBHOOK_URL: undefined });
    loadEnv();
    const output = (stderrSpy.mock.calls[0][0] as string);
    expect(output).toContain('GOVERNANCE_CONTRACT_ID');
    expect(output).toContain('WEBHOOK_URL');
  });

  it('returns parsed env when all required vars are set', () => {
    const { loadEnv } = loadWithEnv(REQUIRED);
    const env = loadEnv();
    expect(env.GOVERNANCE_CONTRACT_ID).toBe('CAABC123');
    expect(env.WEBHOOK_URL).toBe('https://hooks.example.com/notify');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('applies defaults for optional vars', () => {
    const { loadEnv } = loadWithEnv(REQUIRED);
    const env = loadEnv();
    expect(env.NODE_ENV).toBe('development');
    expect(env.POLL_INTERVAL_MS).toBe(6000);
    expect(env.HEALTH_PORT).toBe(8080);
  });

  it('rejects an invalid WEBHOOK_URL', () => {
    const { loadEnv } = loadWithEnv({ ...REQUIRED, WEBHOOK_URL: 'not-a-url' });
    loadEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('loadEnv faucet secret source validation', () => {
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  const FAUCET_VARS = [
    'FAUCET_ENABLED',
    'FAUCET_SECRET_KEY_FILE',
    'FAUCET_SECRET_KEY_AWS_SECRET_ID',
    'FAUCET_SECRET_KEY',
  ] as const;

  const SECRET_VALUE = 'SFAUCETSUPERSECRETVALUE1234567890';

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    delete process.env.GOVERNANCE_CONTRACT_ID;
    delete process.env.WEBHOOK_URL;
    for (const key of FAUCET_VARS) delete process.env[key];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    for (const key of FAUCET_VARS) delete process.env[key];
  });

  function stderrOutput(): string {
    return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  it('exits when FAUCET_ENABLED=true and no secret source is set', () => {
    const { loadEnv } = loadWithEnv({ ...REQUIRED, FAUCET_ENABLED: 'true' });
    loadEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput()).toMatch(/FAUCET_SECRET_KEY_FILE/);
  });

  it('exits when more than one secret source is set', () => {
    const { loadEnv } = loadWithEnv({
      ...REQUIRED,
      FAUCET_ENABLED: 'true',
      FAUCET_SECRET_KEY_FILE: '/run/secrets/faucet.key',
      FAUCET_SECRET_KEY: SECRET_VALUE,
    });
    loadEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput()).toMatch(/exactly one/i);
  });

  it('does not leak the secret value in stderr output', () => {
    const { loadEnv } = loadWithEnv({
      ...REQUIRED,
      FAUCET_ENABLED: 'true',
      FAUCET_SECRET_KEY_FILE: '/run/secrets/faucet.key',
      FAUCET_SECRET_KEY: SECRET_VALUE,
    });
    loadEnv();
    expect(stderrOutput()).not.toContain(SECRET_VALUE);
  });

  it('succeeds when exactly one secret source is set (file)', () => {
    const { loadEnv } = loadWithEnv({
      ...REQUIRED,
      FAUCET_ENABLED: 'true',
      FAUCET_SECRET_KEY_FILE: '/run/secrets/faucet.key',
    });
    const env = loadEnv();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(env.FAUCET_SECRET_KEY_FILE).toBe('/run/secrets/faucet.key');
  });

  it('succeeds when exactly one secret source is set (AWS Secrets Manager)', () => {
    const { loadEnv } = loadWithEnv({
      ...REQUIRED,
      FAUCET_ENABLED: 'true',
      FAUCET_SECRET_KEY_AWS_SECRET_ID: 'faucet/signing-key',
    });
    const env = loadEnv();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(env.FAUCET_SECRET_KEY_AWS_SECRET_ID).toBe('faucet/signing-key');
  });

  it('succeeds when exactly one secret source is set (env var fallback)', () => {
    const { loadEnv } = loadWithEnv({
      ...REQUIRED,
      FAUCET_ENABLED: 'true',
      FAUCET_SECRET_KEY: SECRET_VALUE,
    });
    const env = loadEnv();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(env.FAUCET_SECRET_KEY).toBe(SECRET_VALUE);
  });

  it('does not require a secret source when FAUCET_ENABLED is not true', () => {
    const { loadEnv } = loadWithEnv({ ...REQUIRED, FAUCET_ENABLED: 'false' });
    loadEnv();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
