import { readFileSync } from 'node:fs';

/**
 * Secret resolution for the faucet signing keypair.
 *
 * Resolution order:
 *   1. FAUCET_SECRET_KEY_FILE          – path to a file containing the secret (recommended)
 *   2. FAUCET_SECRET_KEY_AWS_SECRET_ID – AWS Secrets Manager secret identifier/ARN
 *   3. FAUCET_SECRET_KEY               – legacy env var (deprecated, local dev only)
 *
 * Exactly one source must be configured. Secret values are never included in
 * thrown errors or warnings.
 */

let deprecationWarned = false;

/**
 * Returns a constant placeholder for a secret value. Intended for tests and
 * any diagnostic output so that secret material is never emitted.
 */
export function redactSecret(_value: string): string {
  return '[Redacted]';
}

function readSecretFromFile(filePath: string): string {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read faucet secret key file at "${filePath}": ${reason}`,
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(
      `Faucet secret key file at "${filePath}" is empty.`,
    );
  }
  return trimmed;
}

async function loadSecretFromAws(secretId: string): Promise<string> {
  let SecretsManagerClient: typeof import('@aws-sdk/client-secrets-manager').SecretsManagerClient;
  let GetSecretValueCommand: typeof import('@aws-sdk/client-secrets-manager').GetSecretValueCommand;

  try {
    // Lazy import so the AWS SDK is an optional dependency.
    const mod = await import('@aws-sdk/client-secrets-manager');
    SecretsManagerClient = mod.SecretsManagerClient;
    GetSecretValueCommand = mod.GetSecretValueCommand;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `FAUCET_SECRET_KEY_AWS_SECRET_ID is configured but "@aws-sdk/client-secrets-manager" could not be loaded: ${reason}`,
    );
  }

  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? undefined;
  const client = new SecretsManagerClient(region ? { region } : {});

  let response: import('@aws-sdk/client-secrets-manager').GetSecretValueCommandOutput;
  try {
    response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load faucet secret key from AWS Secrets Manager (secret id "${secretId}"): ${reason}`,
    );
  }

  const secretString = response.SecretString;
  if (!secretString || secretString.trim().length === 0) {
    throw new Error(
      `AWS Secrets Manager secret "${secretId}" did not contain a non-empty SecretString.`,
    );
  }

  const trimmed = secretString.trim();

  // Support either a plain string or a JSON object with a `secretKey` field.
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const candidate =
        (parsed.secretKey as unknown) ??
        (parsed.secret_key as unknown) ??
        (parsed.FAUCET_SECRET_KEY as unknown);
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    } catch {
      // Not valid JSON; fall through and treat as plain string.
    }
  }

  return trimmed;
}

/**
 * Resolves the faucet signing keypair secret from the configured source.
 *
 * Throws if no source is configured, if multiple sources are configured, or if
 * the configured source cannot be read. Never includes the secret value in any
 * error message.
 */
export async function resolveFaucetSecretKey(
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const filePath = env.FAUCET_SECRET_KEY_FILE?.trim();
  const awsSecretId = env.FAUCET_SECRET_KEY_AWS_SECRET_ID?.trim();
  const legacyKey = env.FAUCET_SECRET_KEY?.trim();

  const configured: string[] = [];
  if (filePath) configured.push('FAUCET_SECRET_KEY_FILE');
  if (awsSecretId) configured.push('FAUCET_SECRET_KEY_AWS_SECRET_ID');
  if (legacyKey) configured.push('FAUCET_SECRET_KEY');

  if (configured.length === 0) {
    throw new Error(
      'No faucet secret key source configured. Set FAUCET_SECRET_KEY_FILE (recommended), ' +
        'FAUCET_SECRET_KEY_AWS_SECRET_ID, or FAUCET_SECRET_KEY (deprecated).',
    );
  }

  if (configured.length > 1) {
    throw new Error(
      `Multiple faucet secret key sources configured (${configured.join(', ')}). ` +
        'Configure exactly one source.',
    );
  }

  if (filePath) {
    return readSecretFromFile(filePath);
  }

  if (awsSecretId) {
    return loadSecretFromAws(awsSecretId);
  }

  // Legacy env var fallback.
  if (!deprecationWarned) {
    deprecationWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[DEPRECATION] FAUCET_SECRET_KEY env var is deprecated and insecure ' +
        '(visible in /proc, logs, and crash dumps). Use FAUCET_SECRET_KEY_FILE ' +
        'or FAUCET_SECRET_KEY_AWS_SECRET_ID instead.',
    );
  }

  if (!legacyKey) {
    throw new Error('FAUCET_SECRET_KEY is set but empty.');
  }
  return legacyKey;
}