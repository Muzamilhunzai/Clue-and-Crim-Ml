import type { Db } from '../database/connection';
import type { Page } from '../domain/types';
import { likePattern } from '../utils/validation';

export interface CaseFilters {
  q?: string;
  status?: string;
  priority?: string;
  crime_type?: string;
  assignee?: number;
  archived?: 'exclude' | 'only' | 'include';
  sort?: string;
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const PRIORITY_RANK = `CASE s.priority WHEN 'critical' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END`;
const STATUS_RANK = `CASE s.status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 WHEN 'suspect_identified' THEN 2 ELSE 3 END`;

export const CASE_SORTS: Record<string, string> = {
  updated: 's.updated_at',
  created: 's.created_at',
  incident: 's.incident_date',
  number: 's.case_number',
  title: 's.title COLLATE NOCASE',
  priority: PRIORITY_RANK,
  status: STATUS_RANK,
};

function whereClause(f: Partial<CaseFilters>, includeStatus = true) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (f.q) {
    where.push(`(s.title LIKE @q ESCAPE '\\' OR s.case_number LIKE @q ESCAPE '\\' OR s.description LIKE @q ESCAPE '\\' OR s.location_name LIKE @q ESCAPE '\\')`);
    params.q = likePattern(f.q);
  }
  if (includeStatus && f.status) { where.push('s.status = @status'); params.status = f.status; }
  if (f.priority) { where.push('s.priority = @priority'); params.priority = f.priority; }
  if (f.crime_type) { where.push('s.crime_type = @crime_type'); params.crime_type = f.crime_type; }
  if (f.assignee) {
    where.push('EXISTS (SELECT 1 FROM case_investigators ci WHERE ci.case_id = s.id AND ci.user_id = @assignee)');
    params.assignee = f.assignee;
  }
  const archived = f.archived ?? 'exclude';
  if (archived === 'exclude') where.push('s.is_archived = 0');
  if (archived === 'only') where.push('s.is_archived = 1');
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SELECT = `SELECT s.*, c.version FROM v_case_summary s JOIN cases c ON c.id = s.id`;

export function listCases(db: Db, f: CaseFilters): Page<Record<string, unknown>> {
  const { clause, params } = whereClause(f);
  const sortExpr = CASE_SORTS[f.sort ?? ''] ?? CASE_SORTS.updated;
  const dir = (f.sort && CASE_SORTS[f.sort] ? f.order : undefined) === 'asc' ? 'ASC' : 'DESC';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM v_case_summary s ${clause}`).get(params) as { n: number }).n;
  const items = db
    .prepare(`${SELECT} ${clause} ORDER BY ${sortExpr} ${dir}, s.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: f.pageSize, offset: (f.page - 1) * f.pageSize }) as Record<string, unknown>[];
  return { items, total, page: f.page, pageSize: f.pageSize };
}

/**
 * Board query: one pass over the cases using window functions.
 * ROW_NUMBER() caps each column, COUNT() OVER gives the full column size.
 */
export function boardCases(db: Db, f: Partial<CaseFilters>, perColumn = 40) {
  const { clause, params } = whereClause({ ...f, archived: 'exclude' }, false);
  const sortExpr = CASE_SORTS[f.sort ?? ''] ?? CASE_SORTS.updated;
  const dir = (f.sort && CASE_SORTS[f.sort] ? f.order : undefined) === 'asc' ? 'ASC' : 'DESC';
  return db
    .prepare(
      `SELECT * FROM (
         SELECT s.*, c.version,
                ROW_NUMBER() OVER (PARTITION BY s.status ORDER BY ${sortExpr} ${dir}, s.id DESC) AS rn,
                COUNT(*)     OVER (PARTITION BY s.status) AS column_total
           FROM v_case_summary s JOIN cases c ON c.id = s.id
           ${clause}
       ) WHERE rn <= @perColumn
       ORDER BY status, rn`,
    )
    .all({ ...params, perColumn }) as (Record<string, unknown> & { status: string; column_total: number })[];
}

export function getCaseRow(db: Db, id: number): Record<string, unknown> | undefined {
  return db
    .prepare(
      `SELECT s.*, c.version, l.address AS location_address, l.kind AS location_kind, l.city AS location_city,
              u.full_name AS created_by_name
         FROM v_case_summary s
         JOIN cases c ON c.id = s.id
         LEFT JOIN locations l ON l.id = s.location_id
         LEFT JOIN users u ON u.id = s.created_by
        WHERE s.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
}

export function investigatorsFor(db: Db, caseIds: number[]): Map<number, { id: number; full_name: string; role: string; assignment_role: string }[]> {
  const map = new Map<number, { id: number; full_name: string; role: string; assignment_role: string }[]>();
  if (!caseIds.length) return map;
  const rows = db
    .prepare(
      `SELECT ci.case_id, u.id, u.full_name, u.role, ci.role AS assignment_role
         FROM case_investigators ci JOIN users u ON u.id = ci.user_id
        WHERE ci.case_id IN (${caseIds.map(() => '?').join(',')})
        ORDER BY (ci.role = 'lead') DESC, u.full_name COLLATE NOCASE`,
    )
    .all(...caseIds) as { case_id: number; id: number; full_name: string; role: string; assignment_role: string }[];
  for (const r of rows) {
    const { case_id, ...rest } = r;
    if (!map.has(case_id)) map.set(case_id, []);
    map.get(case_id)!.push(rest);
  }
  return map;
}

export const caseExists = (db: Db, id: number) => !!db.prepare('SELECT 1 FROM cases WHERE id = ?').get(id);

export const isAssigned = (db: Db, caseId: number, userId: number) =>
  !!db.prepare('SELECT 1 FROM case_investigators WHERE case_id = ? AND user_id = ?').get(caseId, userId);

export const caseFlags = (db: Db, id: number) =>
  db.prepare('SELECT id, case_number, title, status, is_archived, version FROM cases WHERE id = ?').get(id) as
    | { id: number; case_number: string; title: string; status: string; is_archived: number; version: number }
    | undefined;

export function insertCase(db: Db, d: Record<string, unknown>): number {
  return Number(
    db
      .prepare(
        `INSERT INTO cases (case_number, title, description, crime_type, incident_date, location_id, priority, created_by)
         VALUES (@case_number, @title, @description, @crime_type, @incident_date, @location_id, @priority, @created_by)`,
      )
      .run(d).lastInsertRowid,
  );
}

const EDITABLE = ['title', 'description', 'crime_type', 'incident_date', 'location_id', 'priority'];

/** Optimistic-lock update: succeeds only when the caller's version is still current. Returns rows changed (0 = stale). */
export function updateCase(db: Db, id: number, version: number, patch: Record<string, unknown>): number {
  const cols = Object.keys(patch).filter((k) => EDITABLE.includes(k) && patch[k] !== undefined);
  const sets = [...cols.map((c) => `${c} = @${c}`), 'version = version + 1'];
  return db
    .prepare(`UPDATE cases SET ${sets.join(', ')} WHERE id = @__id AND version = @__version`)
    .run({ ...patch, __id: id, __version: version }).changes;
}

export function setStatus(db: Db, id: number, version: number | undefined, status: string, resolution: string | null): number {
  const closing = status === 'closed';
  return db
    .prepare(
      `UPDATE cases
          SET status = @status, resolution = @resolution,
              closed_at = ${closing ? `strftime('%Y-%m-%dT%H:%M:%SZ','now')` : 'NULL'},
              version = version + 1
        WHERE id = @id ${version === undefined ? '' : 'AND version = @version'}`,
    )
    .run({ id, status, resolution, version }).changes;
}

export const setArchived = (db: Db, id: number, archived: boolean) =>
  db
    .prepare(
      `UPDATE cases SET is_archived = @a, archived_at = ${archived ? `strftime('%Y-%m-%dT%H:%M:%SZ','now')` : 'NULL'},
              version = version + 1 WHERE id = @id`,
    )
    .run({ id, a: archived ? 1 : 0 }).changes;

// ---- investigators --------------------------------------------------------

export const upsertAssignment = (db: Db, caseId: number, userId: number, role: string, by: number) =>
  db
    .prepare(
      `INSERT INTO case_investigators (case_id, user_id, role, assigned_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(case_id, user_id) DO UPDATE SET role = excluded.role, assigned_by = excluded.assigned_by`,
    )
    .run(caseId, userId, role, by);

export const demoteLead = (db: Db, caseId: number) =>
  db.prepare(`UPDATE case_investigators SET role = 'support' WHERE case_id = ? AND role = 'lead'`).run(caseId);

export const removeAssignment = (db: Db, caseId: number, userId: number) =>
  db.prepare('DELETE FROM case_investigators WHERE case_id = ? AND user_id = ?').run(caseId, userId).changes;

export const assignmentRole = (db: Db, caseId: number, userId: number) =>
  (db.prepare('SELECT role FROM case_investigators WHERE case_id = ? AND user_id = ?').get(caseId, userId) as { role: string } | undefined)?.role;

// ---- people links (junction tables) ----------------------------------------

export const LINKS = {
  suspects: { table: 'case_suspects', fk: 'suspect_id', entity: 'suspect', cols: ['involvement_status', 'notes'] },
  victims: { table: 'case_victims', fk: 'victim_id', entity: 'victim', cols: ['harm_summary', 'notes'] },
  witnesses: { table: 'case_witnesses', fk: 'witness_id', entity: 'witness', cols: ['statement_summary', 'interview_date', 'follow_up_status', 'notes'] },
} as const;
export type LinkKind = keyof typeof LINKS;

export function insertLink(db: Db, kind: LinkKind, caseId: number, entityId: number, data: Record<string, unknown>, userId: number) {
  const l = LINKS[kind];
  const cols = l.cols.filter((c) => data[c] !== undefined);
  db.prepare(
    `INSERT INTO ${l.table} (case_id, ${l.fk}, ${cols.join(', ')}${cols.length ? ',' : ''} linked_by)
     VALUES (@case_id, @entity_id, ${cols.map((c) => '@' + c).join(', ')}${cols.length ? ',' : ''} @linked_by)`,
  ).run({ ...data, case_id: caseId, entity_id: entityId, linked_by: userId });
}

export function updateLink(db: Db, kind: LinkKind, caseId: number, entityId: number, data: Record<string, unknown>): number {
  const l = LINKS[kind];
  const cols = l.cols.filter((c) => data[c] !== undefined);
  if (!cols.length) return 0;
  return db
    .prepare(`UPDATE ${l.table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE case_id = @case_id AND ${l.fk} = @entity_id`)
    .run({ ...data, case_id: caseId, entity_id: entityId }).changes;
}

export const deleteLink = (db: Db, kind: LinkKind, caseId: number, entityId: number): number => {
  const l = LINKS[kind];
  return db.prepare(`DELETE FROM ${l.table} WHERE case_id = ? AND ${l.fk} = ?`).run(caseId, entityId).changes;
};

export const linkedPeople = {
  suspects: (db: Db, caseId: number) =>
    db.prepare(
      `SELECT cs.suspect_id AS id, s.suspect_code AS code, s.full_name, s.alias, s.occupation,
              cs.involvement_status, cs.notes, cs.linked_at,
              (SELECT COUNT(*) FROM case_suspects x WHERE x.suspect_id = s.id) AS case_count
         FROM case_suspects cs JOIN suspects s ON s.id = cs.suspect_id
        WHERE cs.case_id = ? ORDER BY cs.linked_at, s.full_name`,
    ).all(caseId),
  victims: (db: Db, caseId: number) =>
    db.prepare(
      `SELECT cv.victim_id AS id, v.victim_code AS code, v.full_name, v.victim_type, cv.harm_summary, cv.notes, cv.linked_at,
              (SELECT COUNT(*) FROM case_victims x WHERE x.victim_id = v.id) AS case_count
         FROM case_victims cv JOIN victims v ON v.id = cv.victim_id
        WHERE cv.case_id = ? ORDER BY cv.linked_at, v.full_name`,
    ).all(caseId),
  witnesses: (db: Db, caseId: number) =>
    db.prepare(
      `SELECT cw.witness_id AS id, w.witness_code AS code, w.full_name, w.occupation, w.is_protected,
              cw.statement_summary, cw.interview_date, cw.follow_up_status, cw.notes, cw.linked_at,
              (SELECT COUNT(*) FROM case_witnesses x WHERE x.witness_id = w.id) AS case_count
         FROM case_witnesses cw JOIN witnesses w ON w.id = cw.witness_id
        WHERE cw.case_id = ? ORDER BY cw.linked_at, w.full_name`,
    ).all(caseId),
};

export const caseEvidence = (db: Db, caseId: number) =>
  db.prepare(
    `SELECT e.id, e.evidence_code, e.title, e.category, e.status, e.collected_at, u.full_name AS custodian_name
       FROM evidence e JOIN users u ON u.id = e.current_custodian_id
      WHERE e.case_id = ? ORDER BY e.collected_at DESC`,
  ).all(caseId);

export const caseClues = (db: Db, caseId: number) =>
  db.prepare(
    `SELECT k.id, k.clue_code, k.title, k.confidence, k.status, k.discovered_at, k.source
       FROM clues k WHERE k.case_id = ? ORDER BY k.discovered_at DESC, k.id DESC`,
  ).all(caseId);

export const caseNotes = (db: Db, caseId: number) =>
  db.prepare(
    `SELECT n.id, n.body, n.created_at, u.full_name AS author
       FROM case_notes n JOIN users u ON u.id = n.user_id WHERE n.case_id = ? ORDER BY n.created_at DESC, n.id DESC`,
  ).all(caseId);

export const insertNote = (db: Db, caseId: number, userId: number, body: string) =>
  Number(db.prepare('INSERT INTO case_notes (case_id, user_id, body) VALUES (?, ?, ?)').run(caseId, userId, body).lastInsertRowid);

export const caseActivity = (db: Db, caseId: number, limit = 25) =>
  db.prepare(
    `SELECT a.id, a.action, a.summary, a.created_at, u.full_name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.case_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
  ).all(caseId, limit);

export const caseSelectOptions = (db: Db) =>
  db.prepare(
    `SELECT id, case_number, title, status, is_archived FROM cases WHERE is_archived = 0 ORDER BY case_number DESC`,
  ).all();
