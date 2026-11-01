import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config';
import type { Db } from '../database/connection';
import type { AuthUser } from '../domain/types';
import * as users from '../repositories/userRepository';
import * as sessions from '../repositories/sessionRepository';
import { audit } from '../repositories/auditRepository';
import { AppError, forbidden, unauthorized, unprocessable } from '../utils/errors';
import { parse, passwordSchema } from '../utils/validation';

/** SHA-256 of the cookie token: the database never stores a usable session token. */
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// Compared against when the account does not exist, so response time does not reveal valid logins.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

const loginSchema = z.object({
  login: z.string({ error: 'Enter your email or username.' }).trim().min(1, 'Enter your email or username.').max(120),
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
});

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export async function login(db: Db, body: unknown, meta: { ip?: string; userAgent?: string }): Promise<LoginResult> {
  const { login: id, password } = parse(loginSchema, body);
  const row = users.findByLogin(db, id);
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  if (!row.is_active) throw forbidden('This account has been deactivated. Contact the chief investigator.');

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = db.transaction(() => {
    sessions.purgeExpired(db);
    const exp = sessions.createSession(db, hashToken(token), row.id, config.sessionTtlHours, meta.ip, meta.userAgent);
    users.touchLogin(db, row.id);
    audit(db, row, { action: 'auth.login', entityType: 'session', entityId: row.id, summary: `${row.full_name} signed in` });
    return exp;
  }).immediate();

  const user = users.findPublicById(db, row.id)!;
  return { user, token, expiresAt };
}

export function logout(db: Db, user: AuthUser, tokenHash: string) {
  db.transaction(() => {
    sessions.deleteSession(db, tokenHash);
    audit(db, user, { action: 'auth.logout', entityType: 'session', entityId: user.id, summary: `${user.full_name} signed out` });
  }).immediate();
}

const changePasswordSchema = z.object({
  current_password: z.string({ error: 'Enter your current password.' }).min(1, 'Enter your current password.'),
  new_password: passwordSchema,
});

export async function changePassword(db: Db, user: AuthUser, body: unknown, currentTokenHash: string) {
  const { current_password, new_password } = parse(changePasswordSchema, body);
  const row = users.findById(db, user.id)!;
  if (!(await bcrypt.compare(current_password, row.password_hash))) {
    throw unprocessable('Your current password is incorrect.', { current_password: 'Your current password is incorrect.' });
  }
  if (current_password === new_password) {
    throw unprocessable('Choose a password you have not used just now.', { new_password: 'Choose a different password.' });
  }
  const hash = await bcrypt.hash(new_password, config.bcryptRounds);
  db.transaction(() => {
    users.setPasswordHash(db, user.id, hash);
    sessions.deleteForUser(db, user.id, currentTokenHash); // sign out every other device
    audit(db, user, { action: 'auth.password', entityType: 'user', entityId: user.id, summary: `${user.full_name} changed their password` });
  }).immediate();
}

export const hashPassword = (password: string) => bcrypt.hash(password, config.bcryptRounds);

/** Demo helper: the seeded accounts, only when DEMO_MODE=true. */
export function demoAccounts(db: Db) {
  if (!config.demoMode) return { enabled: false as const, accounts: [] };
  const rows = db
    .prepare(`SELECT username, full_name, email, role FROM users WHERE is_active = 1 AND email LIKE '%@tracenet.local' ORDER BY id`)
    .all();
  return { enabled: true as const, password: config.demoPassword, accounts: rows };
}
