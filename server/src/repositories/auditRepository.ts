import type { Db } from '../database/connection';
import type { AuthUser, Page } from '../domain/types';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: number | null;
  caseId?: number | null;
  summary: string;
  details?: unknown;
}

/** Append one row to the audit trail (the table is append-only: triggers reject UPDATE/DELETE). */
export function audit(db: Db, user: Pick<AuthUser, 'id'> | null, e: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, details)
     VALUES (@user_id, @action, @entity_type, @entity_id, @case_id, @summary, @details)`,
  ).run({
    user_id: user?.id ?? null,
    action: e.action,
    entity_type: e.entityType,
    entity_id: e.entityId ?? null,
    case_id: e.caseId ?? null,
    summary: e.summary,
    details: e.details === undefined ? null : JSON.stringify(e.details),
  });
}

export interface ActivityFilters {
  page: number;
  pageSize: number;
  entityType?: string;
  userId?: number;
  caseId?: number;
  q?: string;
}

export function listActivity(db: Db, f: ActivityFilters): Page<Record<string, unknown>> {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (f.entityType) { where.push('a.entity_type = @entityType'); params.entityType = f.entityType; }
  if (f.userId) { where.push('a.user_id = @userId'); params.userId = f.userId; }
  if (f.caseId) { where.push('a.case_id = @caseId'); params.caseId = f.caseId; }
  if (f.q) { where.push(`a.summary LIKE @q ESCAPE '\\'`); params.q = `%${f.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`; }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${clause}`).get(params) as { n: number }).n;
  const items = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.case_id, a.summary, a.created_at,
              a.user_id, u.full_name AS user_name, c.case_number
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN cases c ON c.id = a.case_id
         ${clause}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: f.pageSize, offset: (f.page - 1) * f.pageSize }) as Record<string, unknown>[];
  return { items, total, page: f.page, pageSize: f.pageSize };
}
