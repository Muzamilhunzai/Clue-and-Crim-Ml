import type { Db } from '../database/connection';

/**
 * Atomic, gap-free business-code generator backed by the `counters` table.
 * Must be called inside the same transaction as the INSERT that uses the code, so a
 * rolled-back insert also rolls back the counter (no skipped numbers).
 */
function bump(db: Db, key: string): number {
  const row = db
    .prepare(
      `INSERT INTO counters (key, value) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .get(key) as { value: number };
  return row.value;
}

const pad = (n: number) => String(n).padStart(4, '0');
const year = () => new Date().getUTCFullYear();

export const nextCaseNumber = (db: Db) => { const y = year(); return `TN-${y}-${pad(bump(db, `case:${y}`))}`; };
export const nextEvidenceCode = (db: Db) => { const y = year(); return `EV-${y}-${pad(bump(db, `evidence:${y}`))}`; };

const PREFIX = { suspect: 'SU', victim: 'VI', witness: 'WI', clue: 'CL' } as const;
export const nextSimpleCode = (db: Db, type: keyof typeof PREFIX) => `${PREFIX[type]}-${pad(bump(db, type))}`;
