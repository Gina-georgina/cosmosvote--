import { AddressInfo } from 'net';
import { get } from 'http';
import { Server } from 'http';
import { createHealthServer } from '../src/health';

function request(
  server: Server,
  path: string,
  headers?: Record<string, string>,
): Promise<{ statusCode: number; body: string; headers: Record<string, string | string[] | undefined> }> {
  const address = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    get({ hostname: '127.0.0.1', port: address.port, path, headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode ?? 0,
        body,
        headers: response.headers,
      }));
    }).on('error', reject);
  });
}

describe('health endpoints', () => {
  let server: Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('returns liveness status and uptime', async () => {
    server = createHealthServer(async () => true, () => 12.5);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const result = await request(server, '/health');

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 'ok', uptime: 12.5 });
  });

  it('returns 200 when ready and 503 when the dependency is not ready', async () => {
    let ready = true;
    server = createHealthServer(async () => ready);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    expect((await request(server, '/ready')).statusCode).toBe(200);
    ready = false;
    expect((await request(server, '/ready')).statusCode).toBe(503);
  });

  it('sets security headers on health responses', async () => {
    server = createHealthServer(async () => true, () => 1);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { headers } = await request(server, '/health');

    expect(headers['strict-transport-security']).toBe('max-age=31536000');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin');
  });

  it('sets security headers on readiness responses, including 503', async () => {
    let ready = true;
    server = createHealthServer(async () => ready);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const okResponse = await request(server, '/ready');
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(okResponse.headers['x-frame-options']).toBe('DENY');
    expect(okResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(okResponse.headers['referrer-policy']).toBe('strict-origin');

    ready = false;
    const notReadyResponse = await request(server, '/ready');
    expect(notReadyResponse.statusCode).toBe(503);
    expect(notReadyResponse.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(notReadyResponse.headers['x-frame-options']).toBe('DENY');
    expect(notReadyResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(notReadyResponse.headers['referrer-policy']).toBe('strict-origin');
  });

  it('sets a UUID X-Request-Id header on every route', async () => {
    let ready = true;
    server = createHealthServer(async () => ready);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const healthResponse = await request(server, '/health');
    expect(healthResponse.statusCode).toBe(200);
    expect(typeof healthResponse.headers['x-request-id']).toBe('string');
    expect(healthResponse.headers['x-request-id']).toMatch(uuidPattern);

    const readyResponse = await request(server, '/ready');
    expect(readyResponse.statusCode).toBe(200);
    expect(typeof readyResponse.headers['x-request-id']).toBe('string');
    expect(readyResponse.headers['x-request-id']).toMatch(uuidPattern);

    ready = false;
    const notReadyResponse = await request(server, '/ready');
    expect(notReadyResponse.statusCode).toBe(503);
    expect(typeof notReadyResponse.headers['x-request-id']).toBe('string');
    expect(notReadyResponse.headers['x-request-id']).toMatch(uuidPattern);

    expect(healthResponse.headers['x-request-id']).not.toBe(readyResponse.headers['x-request-id']);
  });

  it('echoes a client-supplied X-Request-Id header', async () => {
    let ready = true;
    server = createHealthServer(async () => ready);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const clientRequestId = 'client-supplied-request-id-123';

    const healthResponse = await request(server, '/health', { 'X-Request-Id': clientRequestId });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.headers['x-request-id']).toBe(clientRequestId);

    const readyResponse = await request(server, '/ready', { 'X-Request-Id': clientRequestId });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.headers['x-request-id']).toBe(clientRequestId);

    ready = false;
    const notReadyResponse = await request(server, '/ready', { 'X-Request-Id': clientRequestId });
    expect(notReadyResponse.statusCode).toBe(503);
    expect(notReadyResponse.headers['x-request-id']).toBe(clientRequestId);
  });
});