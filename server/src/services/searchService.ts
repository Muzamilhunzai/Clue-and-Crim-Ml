import type { Db } from '../database/connection';

export interface SearchHit {
  type: string;
  id: number;
  case_id: number | null;
  code: string;
  label: string;
  subtitle: string;
  title_highlight: string;
  snippet: string;
}

/**
 * Global search over the SQLite FTS5 index (kept in sync by triggers, migration 003).
 * Every word becomes a prefix term ("lock" matches "locksmith") and all words must match.
 * Restricted fields (phones, addresses) are not indexed, so search cannot leak them.
 */
export function search(db: Db, q: string, limit = 20): SearchHit[] {
  const terms = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 6);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t}"*`).join(' ');
  try {
    const rows = db
      .prepare(
        `SELECT s.entity_type AS type, s.entity_id AS id, s.case_id,
                highlight(search_index, 3, '[[', ']]')      AS title_highlight,
                snippet(search_index, 4, '[[', ']]', '…', 10) AS snippet,
                n.code, n.label, n.subtitle
           FROM search_index s
           JOIN v_graph_nodes n ON n.entity_type = s.entity_type AND n.entity_id = s.entity_id
          WHERE search_index MATCH @match
          ORDER BY bm25(search_index, 0, 0, 0, 8, 1)
          LIMIT @limit`,
      )
      .all({ match, limit }) as SearchHit[];
    return rows;
  } catch {
    return []; // malformed MATCH expressions must never become a 500
  }
}
