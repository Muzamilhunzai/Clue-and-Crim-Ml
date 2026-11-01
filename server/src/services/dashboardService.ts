import type { Db } from '../database/connection';
import type { AuthUser } from '../domain/types';
import * as rel from './relationshipService';

const one = <T>(db: Db, sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;

/** All dashboard numbers come from live queries; nothing here is hard-coded. */
export function getDashboard(db: Db, user: AuthUser, tzOffsetMinutes: number) {
  const totals = one<{ total: number; active: number; closed: number; archived: number; solved: number; critical: number }>(
    db,
    `SELECT COUNT(*)                                                     AS total,
            COALESCE(SUM(status <> 'closed' AND is_archived = 0), 0)     AS active,
            COALESCE(SUM(status = 'closed'), 0)                          AS closed,
            COALESCE(SUM(is_archived), 0)                                AS archived,
            COALESCE(SUM(status = 'closed' AND resolution IN ('solved','referred_to_court')), 0) AS solved,
            COALESCE(SUM(status <> 'closed' AND is_archived = 0 AND priority = 'critical'), 0)   AS critical
       FROM cases`,
  );

  const byStatus = db
    .prepare(`SELECT status, COUNT(*) AS n FROM cases WHERE is_archived = 0 GROUP BY status`)
    .all() as { status: string; n: number }[];
  const byPriority = db
    .prepare(`SELECT priority, COUNT(*) AS n FROM cases WHERE is_archived = 0 AND status <> 'closed' GROUP BY priority`)
    .all() as { priority: string; n: number }[];
  const byCrimeType = db
    .prepare(`SELECT crime_type, COUNT(*) AS n FROM cases WHERE is_archived = 0 GROUP BY crime_type ORDER BY n DESC LIMIT 6`)
    .all();

  const evidence = one<{ total: number; in_custody: number; in_analysis: number; cases: number }>(
    db,
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('collected','in_storage','in_analysis')), 0) AS in_custody,
            COALESCE(SUM(status = 'in_analysis'), 0) AS in_analysis,
            COUNT(DISTINCT CASE WHEN status IN ('collected','in_storage','in_analysis') THEN case_id END) AS cases
       FROM evidence`,
  );

  const mine = one<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM case_investigators ci JOIN cases c ON c.id = ci.case_id
      WHERE ci.user_id = ? AND c.status <> 'closed' AND c.is_archived = 0`,
    user.id,
  ).n;

  const counts = one<{ suspects: number; victims: number; witnesses: number; clues: number; relationships: number }>(
    db,
    `SELECT (SELECT COUNT(*) FROM suspects)      AS suspects,
            (SELECT COUNT(*) FROM victims)       AS victims,
            (SELECT COUNT(*) FROM witnesses)     AS witnesses,
            (SELECT COUNT(*) FROM clues)         AS clues,
            (SELECT COUNT(*) FROM v_graph_edges) AS relationships`,
  );

  // Records logged per day for the last five days AND the same five weekdays one week earlier
  // (the board's grouped bar chart compares them), in the viewer's time zone.
  const mod = `${tzOffsetMinutes >= 0 ? '+' : '-'}${Math.abs(Math.trunc(tzOffsetMinutes))} minutes`;
  const localNow = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const dayStr = (back: number) => new Date(localNow.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  const days = Array.from({ length: 5 }, (_, i) => dayStr(4 - i));
  const prevDays = days.map((_, i) => dayStr(4 - i + 7));
  const perDay = db
    .prepare(
      `SELECT d, kind, COUNT(*) AS n FROM (
         SELECT date(created_at, @mod) AS d, 'cases'    AS kind FROM cases
         UNION ALL SELECT date(created_at, @mod), 'evidence' FROM evidence
         UNION ALL SELECT date(created_at, @mod), 'clues'    FROM clues
       ) WHERE d >= @from GROUP BY d, kind`,
    )
    .all({ mod, from: prevDays[0] }) as { d: string; kind: 'cases' | 'evidence' | 'clues'; n: number }[];
  const tally = (date: string) => {
    const row = { cases: 0, evidence: 0, clues: 0, total: 0 };
    for (const r of perDay) if (r.d === date) { row[r.kind] = r.n; row.total += r.n; }
    return row;
  };
  const weekly = days.map((date, i) => {
    const prev = tally(prevDays[i]);
    return {
      date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), ...tally(date),
      previous_date: prevDays[i], previous_total: prev.total,
    };
  });
  const sum = (key: 'cases' | 'evidence' | 'clues', dates: string[]) => dates.reduce((n, d) => n + tally(d)[key], 0);
  /** Records logged in the last five days vs the five days a week earlier (drives the KPI arrows). */
  const trend = Object.fromEntries(
    (['cases', 'evidence', 'clues'] as const).map((k) => [k, { current: sum(k, days), previous: sum(k, prevDays) }]),
  );

  const recentActivity = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.case_id, a.summary, a.created_at, u.full_name AS user_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.entity_type <> 'session' ORDER BY a.created_at DESC, a.id DESC LIMIT 7`,
    )
    .all();

  const custodyProblems = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM v_custody_violations').n;
  const hubs = rel.hotspots(db).multiCase.slice(0, 5);

  const closedTotal = totals.closed;
  return {
    totals: {
      ...totals,
      clearance_rate: closedTotal ? Math.round((totals.solved / closedTotal) * 100) : 0,
    },
    byStatus, byPriority, byCrimeType,
    evidence, counts, mine, weekly, trend, recentActivity, hubs,
    integrity: { custody_problems: custodyProblems },
  };
}
