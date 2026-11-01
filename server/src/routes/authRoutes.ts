import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import type { Db } from '../database/connection';
import { PERMISSIONS } from '../domain/permissions';
import { requireAuth } from '../middleware/auth';
import * as auth from '../services/authService';

export function authRoutes(db: Db): Router {
  const r = Router();

  // Brute-force protection: 10 failed sign-ins per IP per 15 minutes (successful ones do not count).
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.isTest ? 1000 : 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed sign-in attempts. Wait 15 minutes and try again.' } }),
  });

  const cookieOptions = (expiresAt?: string) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const result = await auth.login(db, req.body, { ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(config.cookieName, result.token, cookieOptions(result.expiresAt));
    res.json({ user: result.user, permissions: PERMISSIONS[result.user.role] });
  });

  r.post('/logout', requireAuth, (req, res) => {
    auth.logout(db, req.user!, req.sessionHash!);
    res.clearCookie(config.cookieName, cookieOptions());
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user, permissions: PERMISSIONS[req.user!.role] });
  });

  r.post('/change-password', requireAuth, async (req, res) => {
    await auth.changePassword(db, req.user!, req.body, req.sessionHash!);
    res.json({ ok: true });
  });

  // Only answers when DEMO_MODE=true (see .env.example).
  r.get('/demo', (_req, res) => {
    res.json(auth.demoAccounts(db));
  });

  return r;
}
