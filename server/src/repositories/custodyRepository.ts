import type { Db } from '../database/connection';

export interface CustodyRow {
  id: number;
  evidence_id: number;
  seq: number;
  from_custodian_id: number | null;
  from_name: string | null;
  to_custodian_id: number;
  to_name: string;
  transferred_by: number;
  transferred_by_name: string;
  reason: string;
  storage_location: string | null;
  transferred_at: string;
}

export const chain = (db: Db, evidenceId: number): CustodyRow[] =>
  db
    .prepare(
      `SELECT l.id, l.evidence_id, l.seq, l.from_custodian_id, f.full_name AS from_name,
              l.to_custodian_id, t.full_name AS to_name,
              l.transferred_by, b.full_name AS transferred_by_name,
              l.reason, l.storage_location, l.transferred_at
         FROM custody_log l
         LEFT JOIN users f ON f.id = l.from_custodian_id
         JOIN users t ON t.id = l.to_custodian_id
         JOIN users b ON b.id = l.transferred_by
        WHERE l.evidence_id = ?
        ORDER BY l.seq`,
    )
    .all(evidenceId) as CustodyRow[];

export const lastEntry = (db: Db, evidenceId: number) =>
  db.prepare('SELECT seq, to_custodian_id FROM custody_log WHERE evidence_id = ? ORDER BY seq DESC LIMIT 1').get(evidenceId) as
    | { seq: number; to_custodian_id: number }
    | undefined;

export function append(
  db: Db,
  e: { evidence_id: number; seq: number; from: number | null; to: number; by: number; reason: string; storage_location: string | null },
) {
  db.prepare(
    `INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason, storage_location)
     VALUES (@evidence_id, @seq, @from, @to, @by, @reason, @storage_location)`,
  ).run(e);
}

/** Rows of v_custody_violations for one evidence item (empty when the ledger is consistent). */
export const violationsFor = (db: Db, evidenceId: number) =>
  db.prepare('SELECT problem FROM v_custody_violations WHERE evidence_id = ?').all(evidenceId) as { problem: string }[];
