import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import type { Db } from './connection';

/** Fictional demo accounts. All share DEMO_PASSWORD (demo only). Ids are fixed so seed.sql can reference them. */
export const DEMO_USERS = [
  { id: 1, username: 'chief',  full_name: 'Hamza Qureshi',  email: 'chief@tracenet.local',    role: 'chief_investigator', badge: 'TN-001', dept: 'Major Crimes Unit',  phone: '+92 300 0000001', active: 1 },
  { id: 2, username: 'sana',   full_name: 'Sana Iqbal',     email: 'sana@tracenet.local',     role: 'investigator',       badge: 'TN-014', dept: 'Burglary & Theft',   phone: '+92 300 0000002', active: 1 },
  { id: 3, username: 'bilal',  full_name: 'Bilal Ahmed',    email: 'bilal@tracenet.local',    role: 'investigator',       badge: 'TN-021', dept: 'Organised Crime',    phone: '+92 300 0000003', active: 1 },
  { id: 4, username: 'omar',   full_name: 'Omar Siddiqui',  email: 'omar@tracenet.local',     role: 'investigator',       badge: 'TN-027', dept: 'Cyber & Financial',  phone: '+92 300 0000004', active: 1 },
  { id: 5, username: 'mariam', full_name: 'Mariam Farooq',  email: 'evidence@tracenet.local', role: 'evidence_officer',   badge: 'TN-033', dept: 'Evidence Room',      phone: '+92 300 0000005', active: 1 },
  { id: 6, username: 'ayesha', full_name: 'Ayesha Raza',    email: 'ayesha@tracenet.local',   role: 'investigator',       badge: 'TN-038', dept: 'Violent Crimes',     phone: '+92 300 0000006', active: 1 },
  { id: 7, username: 'kamran', full_name: 'Kamran Javed',   email: 'kamran@tracenet.local',   role: 'investigator',       badge: 'TN-041', dept: 'Burglary & Theft',   phone: '+92 300 0000007', active: 0 },
] as const;

/** Keep the code generators (counters table) ahead of every code already in the database. */
export function syncCounters(db: Db): void {
  const upsert = db.prepare(
    `INSERT INTO counters (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = MAX(value, excluded.value)`,
  );
  const maxNumber = (table: string, col: string, prefixLen: number, where = '1=1') =>
    (db.prepare(`SELECT COALESCE(MAX(CAST(substr(${col}, ${prefixLen + 1}) AS INTEGER)), 0) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;

  for (const [key, table, col, len] of [
    ['suspect', 'suspects', 'suspect_code', 3],
    ['victim', 'victims', 'victim_code', 3],
    ['witness', 'witnesses', 'witness_code', 3],
    ['clue', 'clues', 'clue_code', 3],
  ] as const) {
    upsert.run({ key, value: maxNumber(table, col, len) });
  }
  // yearly counters: TN-2026-0007 / EV-2026-0012
  const years = db.prepare(`SELECT DISTINCT substr(case_number, 4, 4) AS y FROM cases`).all() as { y: string }[];
  for (const { y } of years) {
    upsert.run({ key: `case:${y}`, value: maxNumber('cases', 'case_number', 8, `case_number LIKE 'TN-${y}-%'`) });
  }
  const eyears = db.prepare(`SELECT DISTINCT substr(evidence_code, 4, 4) AS y FROM evidence`).all() as { y: string }[];
  for (const { y } of eyears) {
    upsert.run({ key: `evidence:${y}`, value: maxNumber('evidence', 'evidence_code', 8, `evidence_code LIKE 'EV-${y}-%'`) });
  }
}

/**
 * Safe seed: hashes the demo password with bcrypt, inserts the fictional users,
 * then runs database/seed.sql (pure data - no secrets in it).
 */
export function seed(db: Db, password: string = config.demoPassword): { users: number } {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (existing > 0) throw new Error('Database already contains users. Run "npm run db:reset" to start from scratch.');

  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const insertUser = db.prepare(
    `INSERT INTO users (id, username, full_name, email, password_hash, role, badge_number, department, phone, is_active,
                        created_at, updated_at)
     VALUES (@id, @username, @full_name, @email, @hash, @role, @badge, @dept, @phone, @active,
             strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days'))`,
  );
  const sql = fs.readFileSync(config.seedFile, 'utf8');

  // Time helpers used by seed.sql so the demo data is always relative to "now".
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 19) + 'Z';
  db.function('ago_days', { deterministic: false }, (n: unknown) => iso(Number(n)));
  db.function('ago_date', { deterministic: false }, (n: unknown) => iso(Number(n)).slice(0, 10));

  db.transaction(() => {
    for (const u of DEMO_USERS) insertUser.run({ ...u, hash });
    db.exec(sql);
    syncCounters(db);
  }).immediate();

  return { users: DEMO_USERS.length };
}
