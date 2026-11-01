import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

export type Db = Database.Database;

/**
 * Open a SQLite connection with the pragmas TraceNet relies on:
 *  - foreign_keys = ON      (SQLite does NOT enforce FKs unless this is set per connection)
 *  - journal_mode = WAL     (readers never block the writer; better concurrency)
 *  - busy_timeout           (wait briefly for a competing writer instead of failing at once)
 */
export function openDatabase(file: string = config.databasePath, options: { busyTimeoutMs?: number } = {}): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
  return db;
}

/**
 * Run `fn` inside one atomic transaction (BEGIN IMMEDIATE ... COMMIT).
 * Any thrown error rolls every statement back. Nested calls become savepoints.
 */
export function inTransaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn).immediate();
}
