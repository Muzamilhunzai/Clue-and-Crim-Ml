import type { Db } from '../database/connection';
import type { AuthUser } from '../domain/types';

export interface SessionRecord {
  token_hash: string;
  user_id: number;
  expires_at: string;
  last_seen_at: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 19) + 'Z';

export function createSession(db: Db, tokenHash: string, userId: number, ttlHours: number, ip?: string, ua?: string): string {
  const expires = iso(new Date(Date.now() + ttlHours * 3_600_000));
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
  ).run(tokenHash, userId, expires, ip ?? null, (ua ?? '').slice(0, 200));
  return expires;
}

/** Look up a live session and its (active) user in one query. */
export function findLive(db: Db, tokenHash: string): { session: SessionRecord; user: AuthUser } | null {
  const row = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen_at,
              u.id, u.username, u.full_name, u.email, u.role, u.badge_number, u.department, u.phone,
              u.is_active, u.last_login_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now') AND u.is_active = 1`,
    )
    .get(tokenHash) as (SessionRecord & AuthUser) | undefined;
  if (!row) return null;
  const { token_hash, user_id, expires_at, last_seen_at, ...user } = row;
  return { session: { token_hash, user_id, expires_at, last_seen_at }, user };
}

export const touch = (db: Db, tokenHash: string) =>
  db.prepare(`UPDATE sessions SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE token_hash = ?`).run(tokenHash);

export const deleteSession = (db: Db, tokenHash: string) =>
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);

export const deleteForUser = (db: Db, userId: number, exceptHash?: string) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, exceptHash ?? '');

export const purgeExpired = (db: Db) =>
  db.prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')`).run();
