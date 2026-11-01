import type { Db } from '../database/connection';
import type { AuthUser, UserRow } from '../domain/types';

const PUBLIC_COLUMNS =
  'id, username, full_name, email, role, badge_number, department, phone, is_active, last_login_at';

export const findByLogin = (db: Db, login: string): UserRow | undefined =>
  db.prepare('SELECT * FROM users WHERE email = @login OR username = @login').get({ login }) as UserRow | undefined;

export const findById = (db: Db, id: number): UserRow | undefined =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

export const findPublicById = (db: Db, id: number): AuthUser | undefined =>
  db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id) as AuthUser | undefined;

export const touchLogin = (db: Db, id: number) =>
  db.prepare(`UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id);

export const setPasswordHash = (db: Db, id: number, hash: string) =>
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);

export const countActiveChiefs = (db: Db): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'chief_investigator' AND is_active = 1`).get() as { n: number }).n;

/** Investigators with their workload (view v_investigator_workload). */
export function listWithWorkload(db: Db) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.badge_number, u.department, u.phone,
              u.is_active, u.last_login_at, u.created_at,
              w.active_cases, w.closed_cases, w.leading
         FROM users u JOIN v_investigator_workload w ON w.user_id = u.id
        ORDER BY u.is_active DESC,
                 CASE u.role WHEN 'chief_investigator' THEN 0 WHEN 'investigator' THEN 1 ELSE 2 END,
                 u.full_name COLLATE NOCASE`,
    )
    .all() as Record<string, unknown>[];
}

export function assignedCases(db: Db, userId: number) {
  return db
    .prepare(
      `SELECT c.id, c.case_number, c.title, c.status, c.priority, c.is_archived, ci.role AS assignment_role, c.updated_at
         FROM case_investigators ci JOIN cases c ON c.id = ci.case_id
        WHERE ci.user_id = ?
        ORDER BY c.is_archived, (c.status = 'closed'), c.updated_at DESC`,
    )
    .all(userId) as Record<string, unknown>[];
}

export interface NewUser {
  username: string; full_name: string; email: string; role: string; badge_number: string;
  department: string | null; phone: string | null; password_hash: string;
}

export function insertUser(db: Db, u: NewUser): number {
  return Number(
    db
      .prepare(
        `INSERT INTO users (username, full_name, email, password_hash, role, badge_number, department, phone)
         VALUES (@username, @full_name, @email, @password_hash, @role, @badge_number, @department, @phone)`,
      )
      .run(u).lastInsertRowid,
  );
}

export function updateUser(db: Db, id: number, patch: Record<string, unknown>) {
  const allowed = ['full_name', 'email', 'role', 'badge_number', 'department', 'phone', 'is_active', 'username'];
  const cols = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!cols.length) return;
  db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
}

export const activeUsersBrief = (db: Db) =>
  db.prepare(`SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name COLLATE NOCASE`).all() as {
    id: number; full_name: string; role: string;
  }[];
