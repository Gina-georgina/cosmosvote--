import { createServer, Server } from 'http';

export function createHealthServer(
  checkReadiness: () => Promise<boolean>,
  getUptime: () => number = () => process.uptime()
): Server {
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok', uptime: getUptime() }));
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      const ready = await checkReadiness().catch(() => false);
      response.writeHead(ready ? 200 : 503);
      response.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ status: 'not_found' }));
  });
}