import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const logger = new Logger('HttpRequests');
const validRequestId = /^[a-f0-9]{32}$/;

export const observeRequest = (trustGateway: boolean): RequestHandler => (req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = trustGateway && incoming && validRequestId.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-ID', requestId);
  const start = performance.now();
  res.once('finish', () => {
    const durationMs = Math.round(performance.now() - start);
    if (res.statusCode >= 500 || durationMs > 1000) {
      logger.warn({ requestId, method: req.method, route: req.route?.path, status: res.statusCode, durationMs });
    }
  });
  next();
};
