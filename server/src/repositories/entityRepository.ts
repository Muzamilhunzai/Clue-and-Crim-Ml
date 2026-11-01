import type { Db } from '../database/connection';
import type { EntityDef } from '../domain/entities';
import type { Page } from '../domain/types';
import { likePattern } from '../utils/validation';

export interface ListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  filters: Record<string, string | undefined>;
}

/** Generic, whitelist-driven list query: search + filters + sort + pagination (all parameterised). */
export function list(db: Db, def: EntityDef, query: ListQuery): Page<Record<string, unknown>> {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (query.q) {
    where.push('(' + def.searchColumns.map((c) => `${c} LIKE @q ESCAPE '\\'`).join(' OR ') + ')');
    params.q = likePattern(query.q);
  }
  for (const [key, condition] of Object.entries(def.filters)) {
    const value = query.filters[key];
    if (value === undefined || value === '') continue;
    const name = `f_${key}`;
    where.push(condition.replace(/@v\b/g, `@${name}`));
    params[name] = /^-?\d+$/.test(value) ? Number(value) : value;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortExpr = def.sorts[query.sort ?? ''] ?? def.sorts[def.defaultSort];
  const order = (query.sort && def.sorts[query.sort] ? query.order : undefined) ?? def.defaultOrder;
  const dir = order === 'desc' ? 'DESC' : 'ASC';

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${def.selectSql} ${clause})`).get(params) as { n: number }).n;
  const items = db
    .prepare(`${def.selectSql} ${clause} ORDER BY ${sortExpr} ${dir}, t.id ${dir} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize }) as Record<string, unknown>[];
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export const getById = (db: Db, def: EntityDef, id: number): Record<string, unknown> | undefined =>
  db.prepare(`${def.selectSql} WHERE t.id = ?`).get(id) as Record<string, unknown> | undefined;

/** Insert using only keys present in `data`. Column names come from the schema whitelist / code, never from raw input. */
export function insert(db: Db, def: EntityDef, data: Record<string, unknown>): number {
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  const sql = `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`;
  return Number(db.prepare(sql).run(data).lastInsertRowid);
}

export function update(db: Db, def: EntityDef, id: number, patch: Record<string, unknown>): number {
  const cols = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!cols.length) return 0;
  const sql = `UPDATE ${def.table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @__id`;
  return db.prepare(sql).run({ ...patch, __id: id }).changes;
}

export const remove = (db: Db, def: EntityDef, id: number): number =>
  db.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id).changes;

/** Connection counts (graph degree and number of distinct linked cases) for a page of records. */
export function connectionCounts(db: Db, type: string, ids: number[]): Map<number, { connections: number; linked_cases: number }> {
  const out = new Map<number, { connections: number; linked_cases: number }>();
  if (!ids.length) return out;
  const marks = ids.map(() => '?').join(',');
  const degrees = db
    .prepare(`SELECT entity_id, degree FROM v_node_degree WHERE entity_type = ? AND entity_id IN (${marks})`)
    .all(type, ...ids) as { entity_id: number; degree: number }[];
  const cases = db
    .prepare(`SELECT entity_id, case_count FROM v_node_case_links WHERE entity_type = ? AND entity_id IN (${marks})`)
    .all(type, ...ids) as { entity_id: number; case_count: number }[];
  for (const id of ids) out.set(id, { connections: 0, linked_cases: 0 });
  for (const d of degrees) out.get(d.entity_id)!.connections = d.degree;
  for (const c of cases) out.get(c.entity_id)!.linked_cases = c.case_count;
  return out;
}
