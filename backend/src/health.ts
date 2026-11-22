import { createServer, Server } from 'http';
import { metricsHandler } from './metrics';
import { RateLimiter, applyRateLimit } from './rateLimiter';
import { withRequestTimeout } from './requestTimeout';
import { sendProblem, PROBLEM_TYPES } from './problemJson';

export function createHealthServer(
  checkReadiness: () => Promise<boolean>,
  getUptime: () => number = () => process.uptime()
): Server {
  const limiter = new RateLimiter();
  // Clean up stale entries every 5 minutes
  limiter.startCleanup();

  return createServer(withRequestTimeout(async (request, response) => {
    // Apply per-IP rate limiting to all routes
    if (applyRateLimit(limiter, request, response)) return;

    if (request.url === '/metrics') {
      const token = process.env.METRICS_TOKEN;
      if (token) {
        const auth = request.headers.authorization;
        if (auth !== `Bearer ${token}`) {
          sendProblem(response, request, {
            type: PROBLEM_TYPES.unauthorized,
            title: 'Unauthorized',
            status: 401,
            detail: 'A valid METRICS_TOKEN bearer token is required.',
          });
          return;
        }
      }
      await metricsHandler(request, response);
      return;
    }

    response.setHeader('Content-Type', 'application/json');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok', uptime: getUptime() }));
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      const ready = await checkReadiness().catch(() => false);
      if (!ready) {
        sendProblem(response, request, {
          type: PROBLEM_TYPES.notReady,
          title: 'Service Not Ready',
          status: 503,
          detail: 'Readiness check failed.',
        });
        return;
      }
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ready' }));
      return;
    }

    sendProblem(response, request, {
      type: PROBLEM_TYPES.notFound,
      title: 'Not Found',
      status: 404,
      detail: `No route for ${request.method} ${request.url}.`,
    });
  }));
}
