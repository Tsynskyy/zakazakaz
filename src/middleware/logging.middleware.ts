import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const SENSITIVE_KEYS = new Set(['password', 'token', 'refresh_token', 'access_token']);

function maskBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;

  const masked: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(body as Record<string, unknown>)) masked[k] = SENSITIVE_KEYS.has(k) ? '***' : v;

  return masked;
}

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const start = Date.now();

  res.setHeader('X-Request-Id', requestId);

  const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);

  res.on('finish', () => {
    const entry: Record<string, unknown> = {
      request_id: requestId,
      method: req.method,
      endpoint: req.originalUrl.split('?')[0],
      status_code: res.statusCode,
      duration_ms: Date.now() - start,
      user_id: req.userId ?? null,
      timestamp: new Date().toISOString(),
    };

    if (isMutating && req.body) {
      entry.body = maskBody(req.body);
    }

    console.log(JSON.stringify(entry));
  });

  next();
}
