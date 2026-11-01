import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config';
import type { Db } from '../database/connection';
import type { Permission } from '../domain/permissions';
import { roleCan } from '../domain/permissions';
import * as sessions from '../repositories/sessionRepository';
import { hashToken } from '../services/authService';
import { AppError, forbidden, unauthorized } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOUCH_AFTER_MS = 5 * 60_000;

/** Resolve the session cookie into req.user (if valid). Never rejects: use requireAuth for that. */
export const loadSession = (db: Db): RequestHandler => (req, _res, next) => {
  const token = req.cookies?.[config.cookieName] as string | undefined;
  if (token) {
    const hash = hashToken(token);
    const live = sessions.findLive(db, hash);
    if (live) {
      req.user = live.user;
      req.sessionHash = hash;
      if (Date.now() - Date.parse(live.session.last_seen_at) > TOUCH_AFTER_MS) sessions.touch(db, hash);
    }
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roleCan(req.user.role, permission)) return next(forbidden());
    next();
  };

/**
 * CSRF defence for cookie sessions, in two layers:
 *  1. the cookie is SameSite=Lax, so cross-site POSTs do not carry it;
 *  2. every state-changing request must send the custom header X-TraceNet-Client
 *     (a cross-site form or simple fetch cannot add it without a CORS preflight,
 *     which this API refuses) and, when an Origin header is present, it must be ours.
 */
export const csrfGuard: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-tracenet-client') !== 'web') {
    return next(new AppError(403, 'CSRF', 'Missing client header. Reload the page and try again.'));
  }
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* invalid origin */ }
    const allowed = [req.get('host'), new URL(config.clientOrigin).host];
    if (!allowed.includes(host)) return next(new AppError(403, 'CSRF', 'Cross-site request blocked.'));
  }
  next();
};
