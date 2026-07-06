import type { Request, Response, NextFunction } from 'express';
import { findByToken, touchAccess, isAccessControlEnabled } from '../services/accessControlService.js';
import type { AuthenticatedRequest } from '../types/access.js';

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

  return parts[1] || null;
}

/**
 * 认证中间件。
 * 当访问控制未开启时直接放行；否则校验 Bearer Token。
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!isAccessControlEnabled()) {
    next();
    return;
  }

  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const access = findByToken(token);

  if (!access || access.expires_at <= Math.floor(Date.now() / 1000)) {
    res.status(401).json({ error: 'Token invalid or expired' });
    return;
  }

  touchAccess(access.id);

  req.interviewer = {
    email: access.email ?? undefined,
    company_domain: access.company_domain ?? undefined,
    company_name: access.company_name ?? undefined,
  };

  next();
}
