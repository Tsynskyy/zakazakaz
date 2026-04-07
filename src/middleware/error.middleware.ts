import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error_code: err.errorCode,
      message: err.message,
      details: err.details ?? null,
    });

    return;
  }

  if (typeof err === 'object' && err !== null && 'errors' in err && Array.isArray((err as any).errors)) {
    res.status(400).json({
      error_code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        errors: (err as any).errors.map((e: any) => ({ path: e.path, message: e.message })),
      },
    });

    return;
  }

  console.error('Unknown error:', err);

  res.status(500).json({ error_code: 'INTERNAL_ERROR', message: 'Internal server error', details: null });
}
