import { AddressInfo } from 'net';
import { get } from 'http';
import { Server } from 'http';
import { createHealthServer } from '../src/health';

function request(server: Server, path: string): Promise<{ statusCode: number; body: string }> {
  const address = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    get({ hostname: '127.0.0.1', port: address.port, path }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, body }));
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
});