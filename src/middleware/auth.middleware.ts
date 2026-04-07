import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors';
import { verifyAccessToken, type JwtPayload } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      tokenError?: 'TOKEN_EXPIRED' | 'TOKEN_INVALID';
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const payload: JwtPayload = verifyAccessToken(header.slice(7));

    req.userId = payload.sub;
    req.userRole = payload.role;
  } catch (err) {
    if (err instanceof AppError) {
      req.tokenError = err.errorCode as 'TOKEN_EXPIRED' | 'TOKEN_INVALID';
    }
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({
      error_code: req.tokenError ?? 'TOKEN_INVALID',
      message: 'Authentication required',
      details: null,
    });
    return;
  }

  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userId) {
      res.status(401).json({
        error_code: req.tokenError ?? 'TOKEN_INVALID',
        message: 'Authentication required',
        details: null,
      });
      return;
    }

    if (!roles.includes(req.userRole ?? '')) {
      res.status(403).json({
        error_code: 'ACCESS_DENIED',
        message: `Requires role: ${roles.join(' or ')}`,
        details: null,
      });
      return;
    }

    next();
  };
}
