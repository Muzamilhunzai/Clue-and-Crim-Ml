import fs from 'node:fs';
import type { Db } from '../database/connection';
import { openDatabase } from '../database/connection';

/**
 * ADBMS Lab: live demonstrations of transactions, constraints, triggers, isolation and query plans.
 *
 * SAFETY: every demo runs inside BEGIN IMMEDIATE ... ROLLBACK, so the real data is never changed.
 * The only code that is ever executed is the fixed SQL in this file (no user-supplied SQL).
 */

export interface Step {
  label: string;
  sql?: string;
  /**
   * ok = succeeded, rejected = the database refused it (the point of the demo), info = note,
   * warn = a bad outcome shown on purpose, unexpected = the demo did not behave as designed
   */
  status: 'ok' | 'rejected' | 'info' | 'warn' | 'unexpected';
  message: string;
  rows?: unknown[];
}

export interface DemoResult {
  id: string;
  title: string;
  concept: string;
  steps: Step[];
  takeaway: string;
  persisted: false;
}

export const DEMOS = [
  { id: 'atomicity', title: 'Atomic case intake', concept: 'Atomicity (A in ACID)',
    blurb: 'Opens a case, assigns a lead, logs evidence and its first custody entry, then hits a rule violation. Everything is rolled back together.' },
  { id: 'custody-rules', title: 'Chain-of-custody rules', concept: 'Triggers & append-only ledgers',
    blurb: 'Tries to skip a custody step, forge the previous custodian, edit and delete history. Triggers refuse all of it.' },
  { id: 'constraints', title: 'Constraints at work', concept: 'Integrity constraints (Consistency)',
    blurb: 'Ten invalid statements, each stopped by a different database mechanism: CHECK, FK, UNIQUE, partial index, trigger.' },
  { id: 'savepoints', title: 'Savepoints: partial rollback', concept: 'Nested transactions',
    blurb: 'A bulk import of three links where the middle one is invalid. Rolls back to a savepoint and keeps the good ones.' },
  { id: 'lost-update', title: 'Lost update vs optimistic locking', concept: 'Concurrency control',
    blurb: 'Two investigators edit the same case. Without a version check the second save silently wins. With one it is refused.' },
  { id: 'isolation', title: 'Isolation between two connections', concept: 'Isolation (I in ACID) and WAL',
    blurb: 'One connection holds an uncommitted write. A second connection cannot see it, and cannot start its own write.' },
] as const;

type Ctx = { db: Db; steps: Step[] };

const errMsg = (e: unknown) => {
  const err = e as { message?: string; code?: string };
  return `${err.code ? `[${err.code}] ` : ''}${err.message ?? String(e)}`;
};

function sandbox(db: Db, fn: (ctx: Ctx) => void): Step[] {
  const ctx: Ctx = { db, steps: [] };
  db.exec('BEGIN IMMEDIATE');
  try {
    fn(ctx);
  } catch (e) {
    ctx.steps.push({ label: 'Demo stopped', status: 'unexpected', message: errMsg(e) });
  } finally {
    if (db.inTransaction) db.exec('ROLLBACK');
  }
  return ctx.steps;
}

const info = (c: Ctx, label: string, message: string, extra: Partial<Step> = {}) =>
  c.steps.push({ label, status: 'info', message, ...extra });

/** Run a statement that SHOULD succeed. */
function ok<T = unknown>(c: Ctx, label: string, sql: string, run?: () => T, message = 'Succeeded.'): T | undefined {
  try {
    const out = run ? run() : (c.db.exec(sql), undefined);
    c.steps.push({ label, sql, status: 'ok', message });
    return out as T;
  } catch (e) {
    c.steps.push({ label, sql, status: 'unexpected', message: `Failed: ${errMsg(e)}` });
    return undefined;
  }
}

/** Run a statement that the database SHOULD refuse. */
function rejected(c: Ctx, label: string, sql: string, why: string) {
  try {
    c.db.exec(sql);
    c.steps.push({ label, sql, status: 'unexpected', message: 'The database accepted this statement. It should have been refused.' });
  } catch (e) {
    c.steps.push({ label, sql, status: 'rejected', message: `${why}\nDatabase said: ${errMsg(e)}` });
  }
}

const count = (db: Db, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const snapshot = (db: Db) => ({
  cases: count(db, 'cases'), evidence: count(db, 'evidence'), custody_log: count(db, 'custody_log'), case_investigators: count(db, 'case_investigators'),
});
const firstId = <T>(db: Db, sql: string) => (db.prepare(sql).get() as T | undefined);

// ---------------------------------------------------------------------------

function atomicity(db: Db): Step[] {
  return sandbox(db, (c) => {
    const user = firstId<{ id: number }>(db, `SELECT id FROM users WHERE role = 'investigator' AND is_active = 1 ORDER BY id LIMIT 1`)?.id ?? 1;
    const before = snapshot(db);
    info(c, 'Row counts before', 'Snapshot of the tables this workflow touches.', { rows: [before] });
    info(c, 'BEGIN IMMEDIATE', 'The transaction is open. Nothing below is visible to other connections until COMMIT.');

    const caseId = ok(c, '1. Open a case',
      `INSERT INTO cases (case_number, title, incident_date, created_by) VALUES ('TN-2099-0001', 'Lab demo case', date('now'), ${user});`,
      () => Number(db.prepare(`INSERT INTO cases (case_number, title, incident_date, created_by) VALUES ('TN-2099-0001', 'Lab demo case', date('now'), ?)`).run(user).lastInsertRowid));
    if (!caseId) return;
    ok(c, '2. Assign the lead investigator',
      `INSERT INTO case_investigators (case_id, user_id, role) VALUES (${caseId}, ${user}, 'lead');`,
      () => db.prepare(`INSERT INTO case_investigators (case_id, user_id, role) VALUES (?, ?, 'lead')`).run(caseId, user));
    const evId = ok(c, '3. Log an evidence item',
      `INSERT INTO evidence (evidence_code, case_id, title, collected_at, collected_by, current_custodian_id) VALUES ('EV-2099-0001', ${caseId}, 'Demo item', date('now'), ${user}, ${user});`,
      () => Number(db.prepare(`INSERT INTO evidence (evidence_code, case_id, title, collected_at, collected_by, current_custodian_id) VALUES ('EV-2099-0001', ?, 'Demo item', date('now'), ?, ?)`).run(caseId, user, user).lastInsertRowid));
    if (!evId) return;
    ok(c, '4. Write the intake custody entry',
      `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (${evId}, 1, NULL, ${user}, ${user}, 'Collected and logged');`,
      () => db.prepare(`INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (?, 1, NULL, ?, ?, 'Collected and logged')`).run(evId, user, user));
    info(c, 'Row counts inside the transaction', 'This connection sees all four new rows.', { rows: [snapshot(db)] });

    rejected(c, '5. Record a custody transfer that skips a step',
      `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (${evId}, 5, ${user}, ${user + 1}, ${user}, 'Skipped sequence');`,
      'The chain trigger demands seq = previous + 1.');

    info(c, 'ROLLBACK', 'A step failed, so the application aborts the whole workflow. All four earlier inserts are undone together.');
    db.exec('ROLLBACK');
    info(c, 'Row counts after ROLLBACK', 'Identical to the snapshot taken at the start: no half-created case, no orphan evidence.', { rows: [snapshot(db)] });
    const same = JSON.stringify(before) === JSON.stringify(snapshot(db));
    c.steps.push({ label: 'Check', status: same ? 'ok' : 'unexpected', message: same ? 'Before and after counts match: atomicity holds.' : 'Counts differ!' });
  });
}

function custodyRules(db: Db): Step[] {
  return sandbox(db, (c) => {
    const ev = firstId<{ id: number; current: number; code: string }>(
      db, `SELECT e.id, e.current_custodian_id AS current, e.evidence_code AS code FROM evidence e WHERE e.status <> 'disposed' ORDER BY e.id LIMIT 1`);
    if (!ev) return info(c, 'No evidence', 'Seed the database first.');
    const last = db.prepare('SELECT seq, to_custodian_id AS holder FROM custody_log WHERE evidence_id = ? ORDER BY seq DESC LIMIT 1').get(ev.id) as { seq: number; holder: number };
    const other = (db.prepare('SELECT id FROM users WHERE id <> ? AND is_active = 1 ORDER BY id LIMIT 1').get(ev.current) as { id: number }).id;
    info(c, `Evidence ${ev.code}`, `Currently held by user #${ev.current}; the last custody entry is #${last.seq}.`);

    rejected(c, '1. Skip a sequence number',
      `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (${ev.id}, ${last.seq + 2}, ${last.holder}, ${other}, ${ev.current}, 'Skipping ahead');`,
      'Trigger trg_custody_chain: the sequence must continue without gaps.');
    rejected(c, '2. Forge the previous custodian',
      `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (${ev.id}, ${last.seq + 1}, ${other}, ${ev.current}, ${ev.current}, 'Claiming someone else held it');`,
      'Trigger trg_custody_chain: "from" must equal the last recorded holder.');
    rejected(c, '3. Rewrite history (UPDATE)',
      `UPDATE custody_log SET reason = 'Edited later' WHERE evidence_id = ${ev.id} AND seq = 1;`,
      'Trigger trg_custody_no_update makes the ledger append-only.');
    rejected(c, '4. Erase history (DELETE)',
      `DELETE FROM custody_log WHERE evidence_id = ${ev.id};`,
      'Trigger trg_custody_no_delete.');
    rejected(c, '5. Alter the audit log',
      `UPDATE audit_log SET summary = 'nothing happened here' WHERE id = (SELECT MIN(id) FROM audit_log);`,
      'Trigger trg_audit_no_update protects the audit trail the same way.');
    ok(c, '6. A correct transfer',
      `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (${ev.id}, ${last.seq + 1}, ${last.holder}, ${other}, ${ev.current}, 'Lab demonstration');`,
      () => db.prepare(`INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (?, ?, ?, ?, ?, 'Lab demonstration')`).run(ev.id, last.seq + 1, last.holder, other, ev.current),
      'Accepted: it continues the chain correctly. (Rolled back at the end of the demo.)');
    info(c, 'Honest limits', 'These triggers stop the application and ordinary SQL sessions. They are tamper-resistant inside the app, not tamper-proof forensic storage: someone with file access to the .db could still drop the triggers or replace the file.');
  });
}

function constraints(db: Db): Step[] {
  return sandbox(db, (c) => {
    const caseRow = firstId<{ id: number; number: string }>(db, `SELECT id, case_number AS number FROM cases WHERE is_archived = 0 AND status <> 'closed' ORDER BY id LIMIT 1`);
    const archived = firstId<{ id: number }>(db, `SELECT id FROM cases WHERE is_archived = 1 LIMIT 1`);
    const rel = firstId<{ a_type: string; a_id: number; b_type: string; b_id: number; relation_type: string }>(
      db, `SELECT a_type, a_id, b_type, b_id, relation_type FROM relationships ORDER BY id LIMIT 1`);
    const lead = firstId<{ case_id: number }>(db, `SELECT case_id FROM case_investigators WHERE role = 'lead' LIMIT 1`);
    const other = firstId<{ id: number }>(db, `SELECT u.id FROM users u WHERE u.role = 'investigator' AND u.is_active = 1 AND u.id NOT IN (SELECT user_id FROM case_investigators WHERE case_id = ${lead?.case_id ?? 0}) LIMIT 1`);
    const u = (firstId<{ id: number }>(db, 'SELECT id FROM users ORDER BY id LIMIT 1'))!.id;

    rejected(c, '1. CHECK: invalid priority',
      `INSERT INTO cases (case_number, title, incident_date, priority, created_by) VALUES ('TN-2099-0002', 'Bad priority', date('now'), 'urgent', ${u});`,
      'CHECK (priority IN (low, medium, high, critical)).');
    if (caseRow) rejected(c, '2. CHECK: closed without a resolution',
      `UPDATE cases SET status = 'closed' WHERE id = ${caseRow.id};`,
      'A closed case must have closed_at and resolution: CHECK ((status = \'closed\') = (resolution IS NOT NULL)).');
    rejected(c, '3. FOREIGN KEY: evidence for a case that does not exist',
      `INSERT INTO evidence (evidence_code, case_id, title, collected_at, collected_by, current_custodian_id) VALUES ('EV-2099-0002', 999999, 'Orphan', date('now'), ${u}, ${u});`,
      'PRAGMA foreign_keys = ON makes the database refuse orphans.');
    if (caseRow) rejected(c, '4. UNIQUE: duplicate case number',
      `INSERT INTO cases (case_number, title, incident_date, created_by) VALUES ('${caseRow.number}', 'Duplicate number', date('now'), ${u});`,
      'UNIQUE constraint on cases.case_number.');
    if (lead && other) {
      rejected(c, '5. PARTIAL UNIQUE INDEX: a second lead on one case',
        `INSERT INTO case_investigators (case_id, user_id, role) VALUES (${lead.case_id}, ${other.id}, 'lead');`,
        'CREATE UNIQUE INDEX uq_case_single_lead ... WHERE role = \'lead\': at most one lead per case.');
    }
    if (rel) rejected(c, '6. UNIQUE: duplicate relationship',
      `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, created_by) VALUES ('${rel.a_type}', ${rel.a_id}, '${rel.b_type}', ${rel.b_id}, '${rel.relation_type}', ${u});`,
      'The same pair with the same relationship type can only be recorded once.');
    rejected(c, '7. CHECK: reversed pair order',
      `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, created_by) VALUES ('witness', 1, 'clue', 1, 'identified_by', ${u});`,
      'CHECK (a_type < b_type ...) stores each pair once, so A-B and B-A cannot both exist.');
    rejected(c, '8. TRIGGER: relationship type not allowed for these records',
      `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, created_by) VALUES ('suspect', 1, 'victim', 1, 'found_at', ${u});`,
      'Trigger trg_relationship_rules consults the relationship_rules table.');
    rejected(c, '9. TRIGGER: relationship to a record that does not exist',
      `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, created_by) VALUES ('clue', 999999, 'suspect', 1, 'points_to', ${u});`,
      'Polymorphic references cannot use FOREIGN KEY, so trg_relationship_endpoints checks both ends.');
    if (archived) rejected(c, '10. TRIGGER: add evidence to an archived case',
      `INSERT INTO evidence (evidence_code, case_id, title, collected_at, collected_by, current_custodian_id) VALUES ('EV-2099-0003', ${archived.id}, 'Late item', date('now'), ${u}, ${u});`,
      'Archived cases are read-only for new linked records.');
  });
}

function savepoints(db: Db): Step[] {
  return sandbox(db, (c) => {
    const u = (firstId<{ id: number }>(db, 'SELECT id FROM users ORDER BY id LIMIT 1'))!.id;
    const pairs = db.prepare(
      `SELECT s.id AS suspect, k.id AS clue FROM suspects s, clues k
        WHERE NOT EXISTS (SELECT 1 FROM relationships r WHERE r.a_type='clue' AND r.a_id=k.id AND r.b_type='suspect' AND r.b_id=s.id)
        ORDER BY s.id, k.id LIMIT 2`).all() as { suspect: number; clue: number }[];
    if (pairs.length < 2) return info(c, 'Not enough data', 'Seed the database first.');
    const ins = (a: number, b: number, type: string) =>
      `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, created_by) VALUES ('clue', ${a}, 'suspect', ${b}, '${type}', ${u});`;
    const links = db.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number };
    info(c, 'Scenario', 'An import tries to record three links in one transaction. The second is invalid. Instead of abandoning everything, each link gets its own SAVEPOINT.', { rows: [{ relationships_before: links.n }] });

    for (const [i, p] of [[1, pairs[0]], [2, null], [3, pairs[1]]] as const) {
      db.exec(`SAVEPOINT link_${i}`);
      const sql = p ? ins(p.clue, p.suspect, 'points_to') : ins(999999, 1, 'points_to');
      try {
        db.exec(sql);
        db.exec(`RELEASE link_${i}`);
        c.steps.push({ label: `Link ${i}`, sql: `SAVEPOINT link_${i};\n${sql}\nRELEASE link_${i};`, status: 'ok', message: 'Inserted and released (kept inside the outer transaction).' });
      } catch (e) {
        db.exec(`ROLLBACK TO link_${i}`);
        db.exec(`RELEASE link_${i}`);
        c.steps.push({ label: `Link ${i}`, sql: `SAVEPOINT link_${i};\n${sql}\nROLLBACK TO link_${i};`, status: 'rejected', message: `Only this link was undone. ${errMsg(e)}` });
      }
    }
    const inside = db.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number };
    info(c, 'Inside the transaction', 'Two of the three links survived the partial rollback.', { rows: [{ relationships_inside: inside.n, expected: links.n + 2 }] });
    info(c, 'Outer ROLLBACK', 'This is a demo, so the whole outer transaction is also rolled back. Nothing is stored.');
    db.exec('ROLLBACK');
    const after = db.prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number };
    c.steps.push({ label: 'After', status: after.n === links.n ? 'ok' : 'unexpected', message: `Relationship count is back to ${after.n}.` });
  });
}

function lostUpdate(db: Db): Step[] {
  return sandbox(db, (c) => {
    const row = firstId<{ id: number; title: string; version: number }>(db, `SELECT id, title, version FROM cases WHERE is_archived = 0 ORDER BY id LIMIT 1`);
    if (!row) return info(c, 'No cases', 'Seed the database first.');
    info(c, 'Setup', `Alice and Bob both open case #${row.id} while it is at version ${row.version}.`, { rows: [{ title: row.title, version: row.version }] });

    ok(c, 'Alice saves with the version she read',
      `UPDATE cases SET title = 'Alice''s title', version = version + 1 WHERE id = ${row.id} AND version = ${row.version};`,
      () => { const r = db.prepare(`UPDATE cases SET title = 'Alice''s title', version = version + 1 WHERE id = ? AND version = ?`).run(row.id, row.version); if (r.changes !== 1) throw new Error('0 rows changed'); return r; },
      '1 row changed. The case is now at version ' + (row.version + 1) + '.');

    const bob = db.prepare(`UPDATE cases SET title = 'Bob''s title', version = version + 1 WHERE id = ? AND version = ?`).run(row.id, row.version);
    c.steps.push({
      label: 'Bob saves with his stale version (optimistic locking)',
      sql: `UPDATE cases SET title = 'Bob''s title', version = version + 1 WHERE id = ${row.id} AND version = ${row.version};`,
      status: bob.changes === 0 ? 'rejected' : 'unexpected',
      message: bob.changes === 0
        ? '0 rows changed, so the API answers 409 VERSION_CONFLICT and Bob must review Alice\'s change. Her edit is safe.'
        : 'Bob overwrote Alice!',
    });

    const naive = db.prepare(`UPDATE cases SET title = 'Bob''s title' WHERE id = ?`).run(row.id);
    const now = db.prepare('SELECT title, version FROM cases WHERE id = ?').get(row.id);
    c.steps.push({
      label: 'Contrast: the same save WITHOUT a version check',
      sql: `UPDATE cases SET title = 'Bob''s title' WHERE id = ${row.id};`,
      status: 'warn',
      message: `${naive.changes} row changed. Alice's title is gone and nobody was told: the lost update anomaly.`,
      rows: [now],
    });
  });
}

function isolation(db: Db): Step[] {
  if (db.memory) {
    return [{ label: 'Skipped', status: 'info', message: 'This demo needs a file database (an in-memory database cannot be shared by two connections).' }];
  }
  const steps: Step[] = [];
  const reader = openDatabase(db.name, { busyTimeoutMs: 0 });
  const u = (db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number }).id;
  const n = (d: Db) => (d.prepare('SELECT COUNT(*) AS n FROM suspects').get() as { n: number }).n;
  try {
    const before = n(db);
    steps.push({ label: 'Connection A: BEGIN IMMEDIATE', sql: 'BEGIN IMMEDIATE;', status: 'ok', message: 'A takes the (single) write lock.' });
    db.exec('BEGIN IMMEDIATE');
    db.prepare(`INSERT INTO suspects (suspect_code, full_name, created_by) VALUES ('SU-9999', 'Uncommitted Person', ?)`).run(u);
    steps.push({ label: 'Connection A: INSERT a suspect (not committed)', sql: `INSERT INTO suspects (suspect_code, full_name, created_by) VALUES ('SU-9999', 'Uncommitted Person', ${u});`, status: 'ok', message: 'A sees its own change.', rows: [{ suspects_seen_by_A: n(db), before }] });

    const seenByB = n(reader);
    steps.push({
      label: 'Connection B: SELECT COUNT(*) FROM suspects', sql: 'SELECT COUNT(*) FROM suspects;',
      status: seenByB === before ? 'ok' : 'unexpected',
      message: seenByB === before
        ? 'B still sees the old count. No dirty read: in WAL mode readers see the last committed snapshot and are never blocked.'
        : 'B saw uncommitted data!',
      rows: [{ suspects_seen_by_B: seenByB }],
    });

    try {
      reader.exec('BEGIN IMMEDIATE');
      reader.exec('ROLLBACK');
      steps.push({ label: 'Connection B: BEGIN IMMEDIATE', sql: 'BEGIN IMMEDIATE;', status: 'unexpected', message: 'B also obtained the write lock.' });
    } catch (e) {
      steps.push({ label: 'Connection B: BEGIN IMMEDIATE', sql: 'BEGIN IMMEDIATE;', status: 'rejected', message: `Only one writer at a time (serialised writes). ${errMsg(e)}\nThe app uses busy_timeout so real requests wait briefly instead of failing.` });
    }

    db.exec('ROLLBACK');
    steps.push({ label: 'Connection A: ROLLBACK', sql: 'ROLLBACK;', status: 'ok', message: 'The uncommitted suspect disappears and the write lock is released.' });
    try {
      reader.exec('BEGIN IMMEDIATE');
      reader.exec('ROLLBACK');
      steps.push({ label: 'Connection B: BEGIN IMMEDIATE (retry)', status: 'ok', message: 'Now B gets the lock immediately.' });
    } catch (e) {
      steps.push({ label: 'Connection B: retry', status: 'unexpected', message: errMsg(e) });
    }
  } catch (e) {
    steps.push({ label: 'Demo stopped', status: 'unexpected', message: errMsg(e) });
  } finally {
    if (db.inTransaction) db.exec('ROLLBACK');
    reader.close();
  }
  return steps;
}

const TAKEAWAYS: Record<string, string> = {
  atomicity: 'A transaction groups related writes so they succeed or fail as one unit. The service layer wraps every multi-step operation (open case, transfer custody, link records) in exactly this pattern.',
  'custody-rules': 'Business rules live in the database too, so they hold even if application code has a bug. The evidence ledger can only grow, in order.',
  constraints: 'Each failure was caught by a different mechanism, and the API translates each into a clear message instead of a stack trace.',
  savepoints: 'SAVEPOINT / ROLLBACK TO lets one transaction recover from a local failure without losing earlier good work. better-sqlite3 turns nested transaction functions into savepoints.',
  'lost-update': 'Optimistic concurrency (a version column checked in the WHERE clause) detects conflicting edits without holding locks. TraceNet uses it for case edits and board drag-and-drop.',
  isolation: 'SQLite allows many readers plus one writer. Readers see a consistent committed snapshot (no dirty reads) and never block; writes are serialised.',
};

const RUNNERS: Record<string, (db: Db) => Step[]> = {
  atomicity, 'custody-rules': custodyRules, constraints, savepoints, 'lost-update': lostUpdate, isolation,
};

export function runDemo(db: Db, id: string): DemoResult | null {
  const meta = DEMOS.find((d) => d.id === id);
  if (!meta) return null;
  const steps = RUNNERS[id](db);
  return { id, title: meta.title, concept: meta.concept, steps, takeaway: TAKEAWAYS[id], persisted: false };
}

// ---------------------------------------------------------------------------
// introspection
// ---------------------------------------------------------------------------

export function overview(db: Db) {
  const pragma = (name: string) => db.pragma(name, { simple: true });
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index_%' ORDER BY name`).all() as { name: string }[])
    .map((t) => ({ name: t.name, rows: count(db, `"${t.name}"`) }));
  const objects = db.prepare(`SELECT type, COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index_%' GROUP BY type`).all();
  let sizeBytes: number | null = null;
  if (!db.memory) { try { sizeBytes = fs.statSync(db.name).size; } catch { /* ignore */ } }
  return {
    sqlite_version: (db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v,
    foreign_keys: pragma('foreign_keys') === 1,
    journal_mode: String(pragma('journal_mode')),
    busy_timeout_ms: pragma('busy_timeout'),
    integrity_check: String(pragma('integrity_check')),
    foreign_key_violations: (db.pragma('foreign_key_check') as unknown[]).length,
    custody_violations: count(db, 'v_custody_violations'),
    size_bytes: sizeBytes,
    tables,
    objects,
    migrations: db.prepare('SELECT name, applied_at FROM schema_migrations ORDER BY name').all(),
  };
}

export function schema(db: Db) {
  const master = db
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index_%' AND sql IS NOT NULL ORDER BY type, name`)
    .all() as { type: string; name: string; tbl_name: string; sql: string }[];
  const tables = master.filter((m) => m.type === 'table').map((t) => ({
    name: t.name,
    ddl: t.sql,
    columns: (db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string; type: string; notnull: number; pk: number; dflt_value: string | null }[]),
    foreign_keys: db.prepare(`PRAGMA foreign_key_list("${t.name}")`).all(),
    indexes: master.filter((m) => m.type === 'index' && m.tbl_name === t.name).map((i) => ({ name: i.name, ddl: i.sql })),
    triggers: master.filter((m) => m.type === 'trigger' && m.tbl_name === t.name).map((i) => ({ name: i.name, ddl: i.sql })),
  }));
  return {
    tables,
    views: master.filter((m) => m.type === 'view').map((v) => ({ name: v.name, ddl: v.sql })),
    triggers: master.filter((m) => m.type === 'trigger').map((v) => ({ name: v.name, table: v.tbl_name, ddl: v.sql })),
    indexes: master.filter((m) => m.type === 'index').map((v) => ({ name: v.name, table: v.tbl_name, ddl: v.sql })),
  };
}

const VIEWS = new Set(['v_case_summary', 'v_graph_edges', 'v_graph_nodes', 'v_node_degree', 'v_node_case_links', 'v_custody_violations', 'v_investigator_workload']);
export const previewView = (db: Db, name: string) => (VIEWS.has(name) ? db.prepare(`SELECT * FROM ${name} LIMIT 25`).all() : null);
export const viewNames = () => [...VIEWS];

// ---------------------------------------------------------------------------
// query plans
// ---------------------------------------------------------------------------

const PLANS: { id: string; title: string; note: string; sql: string }[] = [
  { id: 'status-index', title: 'Cases by status (index)', note: 'Uses idx_cases_status (is_archived, status): a SEARCH, not a SCAN.',
    sql: `SELECT id FROM cases WHERE is_archived = 0 AND status = 'investigating'` },
  { id: 'status-noindex', title: 'Same query with NOT INDEXED', note: 'Forces a full table SCAN so you can compare the plan and timing.',
    sql: `SELECT id FROM cases NOT INDEXED WHERE is_archived = 0 AND status = 'investigating'` },
  { id: 'evidence-by-case', title: 'Evidence of one case', note: 'idx_evidence_case turns a scan into a lookup.',
    sql: `SELECT id, evidence_code FROM evidence WHERE case_id = 1` },
  { id: 'suspect-name', title: 'Suspect by name (NOCASE index)', note: 'idx_suspects_name is declared with COLLATE NOCASE and matches this predicate.',
    sql: `SELECT id FROM suspects WHERE full_name = 'zain aslam' COLLATE NOCASE` },
  { id: 'custody-last', title: 'Latest custody entry', note: 'The UNIQUE (evidence_id, seq) index serves both the lookup and the ORDER BY.',
    sql: `SELECT seq, to_custodian_id FROM custody_log WHERE evidence_id = 1 ORDER BY seq DESC LIMIT 1` },
  { id: 'fts', title: 'Full-text search (FTS5)', note: 'A virtual table with an inverted index: MATCH instead of LIKE %term%.',
    sql: `SELECT entity_type, entity_id FROM search_index WHERE search_index MATCH '"lock"*'` },
  { id: 'like', title: 'The same search with LIKE', note: 'A leading wildcard cannot use an index, so every row is read.',
    sql: `SELECT id FROM clues WHERE title LIKE '%lock%' OR description LIKE '%lock%'` },
  { id: 'board', title: 'Board query with window functions', note: 'ROW_NUMBER() and COUNT() OVER (PARTITION BY status) build all four columns in one pass.',
    sql: `SELECT id, status, ROW_NUMBER() OVER (PARTITION BY status ORDER BY updated_at DESC) AS rn, COUNT(*) OVER (PARTITION BY status) AS col_total FROM cases WHERE is_archived = 0` },
  { id: 'graph', title: 'Relationship traversal (recursive CTE)', note: 'The engine behind the graph: walks v_graph_edges_undirected up to 2 hops from case 1.',
    sql: `WITH RECURSIVE reach(t, i, d) AS (SELECT 'case', 1, 0 UNION SELECT e.dst_type, e.dst_id, r.d + 1 FROM reach r JOIN v_graph_edges_undirected e ON e.src_type = r.t AND e.src_id = r.i WHERE r.d < 2) SELECT t, i, MIN(d) FROM reach GROUP BY t, i` },
];

export function queryPlans(db: Db) {
  const iterations = 300;
  return PLANS.map((p) => {
    let plan: { detail: string }[] = [];
    let rows = 0;
    let ms = 0;
    let error: string | undefined;
    try {
      plan = db.prepare(`EXPLAIN QUERY PLAN ${p.sql}`).all() as { detail: string }[];
      const stmt = db.prepare(p.sql);
      rows = stmt.all().length;
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) stmt.all();
      ms = Number(process.hrtime.bigint() - t0) / 1e6;
    } catch (e) {
      error = errMsg(e);
    }
    const usesScan = plan.some((r) => /^SCAN /.test(r.detail) && !/CONSTANT ROW|reach|VIRTUAL TABLE/.test(r.detail));
    return {
      ...p, plan: plan.map((r) => r.detail), rows, iterations,
      avg_ms: ms ? +(ms / iterations).toFixed(4) : null,
      access: error ? 'error' : usesScan ? 'scan' : 'index', error,
    };
  });
}
