import type { Db } from '../database/connection';
import type { EntityType } from '../domain/enums';
import { likePattern } from '../utils/validation';

export interface Ref { type: EntityType; id: number }
export const refKey = (r: Ref) => `${r.type}:${r.id}`;

export interface GraphNode {
  key: string;
  type: EntityType;
  id: number;
  code: string;
  label: string;
  subtitle: string;
  status: string | null;
  home_case_id: number | null;
  degree: number;
  case_count: number;
  depth: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  detail: string | null;
  table: string;
  confidence: string;
  removable: boolean;
  relationship_id: number | null;
  description: string | null;
  citation: string | null;
  recorded_on: string | null;
  created_by_name: string | null;
}

interface RawEdge {
  src_type: EntityType; src_id: number; dst_type: EntityType; dst_id: number;
  kind: string; label: string; detail: string | null; source_table: string;
  relationship_id: number | null; confidence: string;
  description: string | null; citation: string | null; recorded_on: string | null; created_by_name: string | null;
}

const REMOVABLE_TABLES = new Set(['relationships', 'case_suspects', 'case_victims', 'case_witnesses']);

/** Stable id for an edge. The id tells DELETE /relationships/:id which table to remove the fact from. */
export function edgeId(e: Pick<RawEdge, 'source_table' | 'src_type' | 'src_id' | 'dst_type' | 'dst_id' | 'relationship_id' | 'kind'>): string {
  if (e.source_table === 'relationships') return `relationships:${e.relationship_id}`;
  if (e.source_table.startsWith('case_')) {
    const [c, p] = e.src_type === 'case' ? [e.src_id, e.dst_id] : [e.dst_id, e.src_id];
    return `${e.source_table}:${c}:${p}`;
  }
  return `${e.source_table}:${e.kind}:${e.src_type}${e.src_id}-${e.dst_type}${e.dst_id}`;
}

function toEdge(e: RawEdge): GraphEdge {
  return {
    id: edgeId(e),
    source: `${e.src_type}:${e.src_id}`,
    target: `${e.dst_type}:${e.dst_id}`,
    kind: e.kind,
    label: e.label,
    detail: e.detail,
    table: e.source_table,
    confidence: e.confidence,
    removable: REMOVABLE_TABLES.has(e.source_table),
    relationship_id: e.relationship_id,
    description: e.description,
    citation: e.citation,
    recorded_on: e.recorded_on,
    created_by_name: e.created_by_name,
  };
}

const EDGE_SELECT = `
  SELECT e.src_type, e.src_id, e.dst_type, e.dst_id, e.kind, e.label, e.detail, e.source_table,
         e.relationship_id, e.confidence,
         r.description AS description, r.source AS citation, r.recorded_on AS recorded_on, u.full_name AS created_by_name`;
const EDGE_JOIN = `
  LEFT JOIN relationships r ON r.id = e.relationship_id
  LEFT JOIN users u ON u.id = r.created_by`;

/**
 * Breadth-limited reachability using a RECURSIVE CTE over the unified edge view.
 * UNION (not UNION ALL) removes repeated (node, depth) rows, so cycles in the graph
 * cannot loop forever and the depth bound guarantees termination.
 */
export function reachable(db: Db, focus: Ref, depth: number): { type: EntityType; id: number; depth: number }[] {
  return db
    .prepare(
      `WITH RECURSIVE reach(t, i, d) AS (
         SELECT @type, CAST(@id AS INTEGER), 0
         UNION
         SELECT e.dst_type, e.dst_id, r.d + 1
           FROM reach r
           JOIN v_graph_edges_undirected e ON e.src_type = r.t AND e.src_id = r.i
          WHERE r.d < @depth
       )
       SELECT t AS type, i AS id, MIN(d) AS depth FROM reach GROUP BY t, i ORDER BY depth, t, i`,
    )
    .all({ type: focus.type, id: focus.id, depth }) as { type: EntityType; id: number; depth: number }[];
}

export function nodesByKeys(db: Db, keys: string[], depthByKey: Map<string, number>): GraphNode[] {
  if (!keys.length) return [];
  const rows = db
    .prepare(
      `SELECT n.entity_type AS type, n.entity_id AS id, n.code, n.label, n.subtitle, n.status, n.home_case_id,
              COALESCE(d.degree, 0) AS degree, COALESCE(c.case_count, 0) AS case_count
         FROM v_graph_nodes n
         LEFT JOIN v_node_degree d     ON d.entity_type = n.entity_type AND d.entity_id = n.entity_id
         LEFT JOIN v_node_case_links c ON c.entity_type = n.entity_type AND c.entity_id = n.entity_id
        WHERE (n.entity_type || ':' || n.entity_id) IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify(keys)) as Omit<GraphNode, 'key' | 'depth'>[];
  return rows.map((r) => ({ ...r, key: `${r.type}:${r.id}`, depth: depthByKey.get(`${r.type}:${r.id}`) ?? 0 }));
}

/** All edges whose BOTH endpoints are inside `keys`. */
export function edgesAmong(db: Db, keys: string[]): GraphEdge[] {
  if (!keys.length) return [];
  const rows = db
    .prepare(
      `${EDGE_SELECT}
         FROM v_graph_edges e ${EDGE_JOIN}
        WHERE (e.src_type || ':' || e.src_id) IN (SELECT value FROM json_each(@keys))
          AND (e.dst_type || ':' || e.dst_id) IN (SELECT value FROM json_each(@keys))`,
    )
    .all({ keys: JSON.stringify(keys) }) as RawEdge[];
  return rows.map(toEdge);
}

/** Direct connections of one record, with the record on the other end. */
export function neighbors(db: Db, ref: Ref): { edge: GraphEdge; other: GraphNode }[] {
  const rows = db
    .prepare(
      `${EDGE_SELECT}
         FROM v_graph_edges_undirected e ${EDGE_JOIN}
        WHERE e.src_type = @type AND e.src_id = @id
        ORDER BY e.dst_type, e.label`,
    )
    .all({ type: ref.type, id: ref.id }) as RawEdge[];
  const keys = [...new Set(rows.map((r) => `${r.dst_type}:${r.dst_id}`))];
  const nodes = new Map(nodesByKeys(db, keys, new Map()).map((n) => [n.key, n]));
  return rows.map((r) => ({ edge: toEdge(r), other: nodes.get(`${r.dst_type}:${r.dst_id}`)! })).filter((x) => x.other);
}

export function getNode(db: Db, ref: Ref): GraphNode | undefined {
  return nodesByKeys(db, [refKey(ref)], new Map())[0];
}

export const nodeExists = (db: Db, ref: Ref) =>
  !!db.prepare('SELECT 1 FROM v_graph_nodes WHERE entity_type = ? AND entity_id = ?').get(ref.type, ref.id);

export function lookup(db: Db, type: EntityType, q: string, limit = 20) {
  const like = q ? likePattern(q) : '%';
  return db
    .prepare(
      `SELECT entity_type AS type, entity_id AS id, code, label, subtitle
         FROM v_graph_nodes
        WHERE entity_type = @type AND (label LIKE @like ESCAPE '\\' OR code LIKE @like ESCAPE '\\')
        ORDER BY label COLLATE NOCASE LIMIT @limit`,
    )
    .all({ type, like, limit });
}

export function rules(db: Db) {
  const types = db.prepare('SELECT code, label, description FROM relationship_types ORDER BY label').all();
  const pairs = db.prepare('SELECT a_type, b_type, relation_type FROM relationship_rules ORDER BY a_type, b_type, relation_type').all();
  return { types, pairs };
}

export const ruleExists = (db: Db, a: EntityType, b: EntityType, code: string) =>
  !!db.prepare('SELECT 1 FROM relationship_rules WHERE a_type = ? AND b_type = ? AND relation_type = ?').get(a, b, code);

export function insertRelationship(db: Db, r: {
  a_type: string; a_id: number; b_type: string; b_id: number; relation_type: string;
  description: string; source: string | null; confidence: string; created_by: number;
}): number {
  return Number(
    db
      .prepare(
        `INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, description, source, confidence, created_by)
         VALUES (@a_type, @a_id, @b_type, @b_id, @relation_type, @description, @source, @confidence, @created_by)`,
      )
      .run(r).lastInsertRowid,
  );
}

export const getRelationship = (db: Db, id: number) =>
  db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as
    | { id: number; a_type: EntityType; a_id: number; b_type: EntityType; b_id: number; relation_type: string }
    | undefined;

export const deleteRelationship = (db: Db, id: number) => db.prepare('DELETE FROM relationships WHERE id = ?').run(id).changes;

export function updateRelationship(db: Db, id: number, patch: { description?: string; source?: string | null; confidence?: string }) {
  const cols = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (!cols.length) return 0;
  return db.prepare(`UPDATE relationships SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @__id`).run({ ...patch, __id: id }).changes;
}

/** Records connected to two or more distinct cases, and the best-connected records overall. */
export function hotspots(db: Db) {
  const multiCase = db
    .prepare(
      `SELECT n.entity_type AS type, n.entity_id AS id, n.code, n.label, n.subtitle,
              c.case_count, COALESCE(d.degree, 0) AS degree
         FROM v_node_case_links c
         JOIN v_graph_nodes n ON n.entity_type = c.entity_type AND n.entity_id = c.entity_id
         LEFT JOIN v_node_degree d ON d.entity_type = c.entity_type AND d.entity_id = c.entity_id
        WHERE c.case_count >= 2
        ORDER BY c.case_count DESC, degree DESC, n.label LIMIT 12`,
    )
    .all();
  const topConnected = db
    .prepare(
      `SELECT n.entity_type AS type, n.entity_id AS id, n.code, n.label, n.subtitle, d.degree
         FROM v_node_degree d
         JOIN v_graph_nodes n ON n.entity_type = d.entity_type AND n.entity_id = d.entity_id
        WHERE d.entity_type <> 'case'
        ORDER BY d.degree DESC, n.label LIMIT 10`,
    )
    .all();
  return { multiCase, topConnected };
}

/**
 * Shortest connection between two records. A RECURSIVE CTE walks the undirected edge
 * view while carrying the visited path as text, refusing to revisit a node (cycle guard).
 */
export function shortestPath(db: Db, from: Ref, to: Ref, maxDepth: number): string[] | null {
  const row = db
    .prepare(
      `WITH RECURSIVE walk(t, i, path, depth) AS (
         SELECT @ft, CAST(@fi AS INTEGER), '|' || @ft || ':' || CAST(@fi AS INTEGER) || '|', 0
         UNION ALL
         SELECT e.dst_type, e.dst_id, w.path || e.dst_type || ':' || e.dst_id || '|', w.depth + 1
           FROM walk w
           JOIN v_graph_edges_undirected e ON e.src_type = w.t AND e.src_id = w.i
          WHERE w.depth < @max
            AND instr(w.path, '|' || e.dst_type || ':' || e.dst_id || '|') = 0
            AND NOT (w.t = @tt AND w.i = @ti)
       )
       SELECT path FROM walk WHERE t = @tt AND i = @ti ORDER BY depth LIMIT 1`,
    )
    .get({ ft: from.type, fi: from.id, tt: to.type, ti: to.id, max: maxDepth }) as { path: string } | undefined;
  return row ? row.path.split('|').filter(Boolean) : null;
}
