# ADBMS Demonstrations — what to show, where, and what to say

This page is the script for presenting TraceNet in the Advanced Database Systems Lab. Every point below can be shown live; the "Where" column says exactly where to click or which file to open.

**Setup:** `npm run dev`, open <http://localhost:5173>, sign in as **`chief`** (the ADBMS Lab page is only visible to the chief investigator). If you want a clean state first, run `npm run db:reset`.

## 0. Concept map

| ADBMS topic | How TraceNet uses it | Where to show it |
| --- | --- | --- |
| Relational design, ER modelling | 22 tables (incl. one FTS5 virtual table), 8 views, 32 indexes, 55 triggers; junction tables with their own attributes; one polymorphic relationship table | `docs/er-diagram.md`; Lab → *Schema explorer* |
| Normalisation (1NF–3NF/BCNF) | Junction tables hold facts about a *pair*; one documented denormalisation | `docs/er-diagram.md` §4 |
| Integrity constraints | `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `CHECK`, `FOREIGN KEY` (`RESTRICT`/`CASCADE`), partial unique index | Lab → *Constraints at work* |
| Triggers | Append-only ledgers, custody-chain rules, archived-case rule, polymorphic integrity, FTS sync, `updated_at` | Lab → *Chain-of-custody rules*; `database/migrations/002_triggers_views.sql` |
| Views | Case summary, graph nodes/edges, degree, custody violations, workload | Lab → *Schema explorer* → view preview |
| Indexes & query plans | Composite, partial, `COLLATE NOCASE`, covering lookups; `EXPLAIN QUERY PLAN` | Lab → *Indexes & query plans* |
| Full-text search | FTS5 virtual table (inverted index) vs `LIKE '%…%'` | Global search (`/`); Lab → *Indexes & query plans* |
| Recursive queries | Graph reachability and shortest path with recursive CTEs | Relationship graph; Lab → *Indexes & query plans* → "Relationship traversal" |
| Window functions | Kanban board: `ROW_NUMBER()` and `COUNT() OVER (PARTITION BY status)` | Dashboard; Lab → *Indexes & query plans* → "Board query" |
| Transactions (ACID) | Every multi-step operation is one `BEGIN IMMEDIATE` transaction | Lab → *Atomic case intake* |
| Savepoints / nested transactions | Partial rollback of one failing step | Lab → *Savepoints* |
| Concurrency control | Optimistic locking with a `version` column | Lab → *Lost update vs optimistic locking*; edit one case in two tabs |
| Isolation, WAL | Two connections: no dirty reads, single writer | Lab → *Isolation between two connections* |
| Security in the data layer | Parameterised SQL, allow-listed sort keys, hashed passwords/sessions, RBAC, field masking, audit trail | `server/src/domain/permissions.ts`, `services/masking.ts` |

## 1. A 15-minute presentation order

### 1.1 Schema and normalisation (3 min)

1. Open **ADBMS lab → Schema explorer**. Expand `cases`, `case_suspects`, `custody_log`, `relationships`.
2. Say: *"A suspect and a case are many-to-many. 'Involvement status' describes the pair, so it lives in the junction table `case_suspects`, not on either entity. That is second normal form in practice."*
3. Point at the `CHECK` constraints on `cases`: a case is closed **if and only if** it has a closing time and a resolution; only closed cases may be archived.
4. Mention the one deliberate denormalisation: `evidence.current_custodian_id`. The view `v_custody_violations` proves it never disagrees with the ledger (Lab → *Database health*: "Custody chain problems: 0").

### 1.2 Constraints do the enforcing (3 min)

Run **Constraints at work**. Ten statements are executed and **all ten are refused by the database**, each by a different mechanism:

| # | Statement | Mechanism |
| --- | --- | --- |
| 1 | Invalid priority | `CHECK … IN (…)` |
| 2 | Closing a case without a resolution | table-level `CHECK` across two columns |
| 3 | Evidence for a case that does not exist | `FOREIGN KEY` (needs `PRAGMA foreign_keys = ON`, set per connection in `database/connection.ts`) |
| 4 | Duplicate case number | `UNIQUE` |
| 5 | A second lead investigator on one case | **partial unique index** `… WHERE role = 'lead'` |
| 6 | Duplicate relationship | composite `UNIQUE` |
| 7 | Reversed relationship (B→A when A→B exists) | `CHECK (a_type < b_type …)` canonical order |
| 8 | A relationship type that makes no sense between two record types | trigger consulting the `relationship_rules` table |
| 9 | Relationship to a record that does not exist | trigger (a foreign key cannot target "whichever table `a_type` names") |
| 10 | New evidence on an archived case | trigger |

Say: *"The API also validates, but the rules are in the database, so they hold for every client, script and future developer."* Then show the same failure from the UI: close a case without choosing a resolution, or add a duplicate relationship, and show the friendly message the API produced from the raw constraint error (`server/src/utils/errors.ts → translateDbError`).

### 1.3 Chain of custody and triggers (3 min)

1. Run **Chain-of-custody rules**: skipping a sequence number, forging the previous custodian, updating history, deleting history and editing the audit log are all refused; a correct transfer is accepted. Everything is rolled back at the end of the demo.
2. In the app: *Evidence → any item → Chain of custody → Transfer*. The timeline shows each hand-over and a green "Chain is consistent" banner, recomputed from the rows on every request.
3. Open `database/migrations/002_triggers_views.sql` and show `trg_custody_chain` (≈ 15 lines of SQL).
4. **Be upfront about the limit:** these triggers stop the application and ordinary SQL sessions. They do **not** make the ledger tamper-proof. Someone with access to the `.db` file could drop the trigger or replace the file. A production system would add hash chaining, write-once storage or an external timestamp authority. The Lab says this on screen.

### 1.4 Transactions: atomicity, savepoints (2 min)

* **Atomic case intake:** opens a case, assigns a lead, logs evidence and writes the intake custody entry — then step 5 breaks a rule. The page shows row counts *before*, *inside* and *after* the `ROLLBACK`: identical before and after.
* **Savepoints:** three links are imported in one transaction; the second is invalid. `ROLLBACK TO link_2` undoes only that one, so two survive inside the transaction.
* Show the helper `inTransaction()` in `server/src/database/connection.ts` — `db.transaction(fn).immediate()` — and say it is used by every multi-step service operation (create case, transfer custody, assign lead, link people). `.immediate()` issues `BEGIN IMMEDIATE`, taking the write lock up front so two writers cannot deadlock halfway through. Nested calls become savepoints.

### 1.5 Concurrency and isolation (2 min)

* **Lost update vs optimistic locking.** Alice and Bob both load case #N at version *v*. Alice saves (`WHERE id = ? AND version = ?` changes 1 row, version becomes *v+1*). Bob's identical statement changes **0 rows**, which the API reports as `409 VERSION_CONFLICT`. The demo also shows the naive `UPDATE` without a version check silently destroying Alice's edit.
  *Live version:* open the same case in two browser tabs, edit the title in both, save in the first and then the second. The second tab gets a conflict message instead of overwriting.
* **Isolation between two connections.** Connection A starts a write and inserts a row without committing. Connection B (a genuinely separate connection to the same file) still sees the old row count — **no dirty read** — and its `BEGIN IMMEDIATE` is refused while A holds the write lock. After A rolls back, B gets the lock.
  Say: *"SQLite runs transactions as serialisable: many readers see a committed snapshot, one writer at a time. WAL mode lets readers continue while a write is in progress. The app sets a `busy_timeout`, so a request that collides with another write waits up to five seconds instead of failing."*

### 1.6 Indexes and query plans (2 min)

Open **Lab → Indexes & query plans**. Each row shows the SQL, the `EXPLAIN QUERY PLAN` output and the measured time. Run the demos from the first tab, **Transactions & integrity**.

| Query | Plan you will see (SQLite 3.x, may vary slightly by version) | Point to make |
| --- | --- | --- |
| Cases by status | `SEARCH cases USING COVERING INDEX idx_cases_status (is_archived=? AND status=?)` | composite index; "covering" means the answer comes from the index alone |
| The same query `NOT INDEXED` | `SCAN cases` | the cost of no index — compare plan and timing |
| Evidence of one case | `SEARCH evidence USING INDEX idx_evidence_case (case_id=?)` | indexing a foreign key |
| Suspect by name | `SEARCH suspects USING COVERING INDEX idx_suspects_name (full_name=?)` | index declared `COLLATE NOCASE` so it matches a case-insensitive predicate |
| Latest custody entry | `SEARCH custody_log USING INDEX sqlite_autoindex_custody_log_1 (evidence_id=?)` | the index created by `UNIQUE (evidence_id, seq)` serves the lookup and the `ORDER BY` |
| Full-text search (FTS5) | `SCAN search_index VIRTUAL TABLE INDEX 0:M5` | despite the word SCAN, this is the FTS5 inverted index answering a `MATCH` (`M5` = match query); it does not read every row |
| The same search with `LIKE '%term%'` | `SCAN clues` | a leading wildcard cannot use a B-tree index, so every row is read |
| Board query | `SEARCH cases USING INDEX idx_cases_status (is_archived=?)` plus co-routines | window functions: `ROW_NUMBER()` caps each column, `COUNT() OVER` gives the column total, in one pass |
| Graph traversal | `CO-ROUTINE reach … RECURSIVE STEP … v_graph_edges_undirected` | the recursive CTE behind the relationship graph |

Honesty note for the viva: the seed data is small (a few dozen rows), so *timings* are all microseconds and differences are tiny. The **plans** (SEARCH vs SCAN) are the evidence, not the milliseconds.

### 1.7 The relationship engine (2 min)

1. Open **Relationship graph**, centre on a case, switch between 1, 2 and 3 hops.
2. Tick **Highlight records in 2+ cases** — records connected to several cases get a dashed ring and a count badge (the seeded suspect *Zain Aslam* and a taxi stand location connect several cases).
3. Click **Find connection**, choose two records: the shortest recorded chain is highlighted.
4. Say what is *not* happening: *"This is graph traversal over relational data. Edges are recorded associations entered by investigators, each with a source and confidence. It is not machine learning, and a link is a lead, not proof."*
5. Show the SQL: `reachable()` and `shortestPath()` in `server/src/repositories/relationshipRepository.ts`. The recursive CTE walks the view `v_graph_edges_undirected`, which is a `UNION ALL` of every junction table, every home-case foreign key and the explicit `relationships` rows. **Nothing in the graph is hard-coded**; add a relationship in the dialog and it appears because a row was inserted.

```sql
WITH RECURSIVE reach(t, i, d) AS (
  SELECT 'case', 1, 0
  UNION
  SELECT e.dst_type, e.dst_id, r.d + 1
    FROM reach r
    JOIN v_graph_edges_undirected e ON e.src_type = r.t AND e.src_id = r.i
   WHERE r.d < 2
)
SELECT t, i, MIN(d) AS depth FROM reach GROUP BY t, i;
```

(`UNION`, not `UNION ALL`, removes duplicate rows so cycles in the graph terminate.)

## 2. Role-based access and masking (optional, 2 min)

1. As `chief`, open a victim or protected witness: contact details visible.
2. Sign out, sign in as **`mariam`** (Evidence Officer): the same API call returns the record **without** those fields (they are absent from the JSON, not merely hidden by CSS). The *Edit case* button is gone; calling `PATCH /api/cases/1` directly returns `403 FORBIDDEN`.
3. As **`sana`** (Investigator): she can edit only cases she is assigned to. Open a case she is not on and try to add a clue — the API answers `403` ("You can only add or change records on cases you are assigned to").
4. Show the matrix in `server/src/domain/permissions.ts` and the tests in `server/tests/` that assert each denial.

## 3. Running the automated tests

```powershell
npm test
```

84 tests run against a temporary database. They cover authentication and sessions, CSRF, RBAC per role, every constraint and trigger in section 1.2 and 1.3, transaction rollback, optimistic locking, case/board/graph queries, search, the dashboard and the Lab demos. They are fast (a few seconds) and can be shown live.

## 4. Likely questions and short answers

**Why SQLite and not MySQL or PostgreSQL?**
The brief required a local, zero-install, persistent relational database. SQLite provides full SQL, ACID transactions, triggers, views, CTEs, window functions and FTS5. The data layer is plain SQL behind repository functions, so porting to PostgreSQL would mainly mean changing types, the `RAISE(ABORT)` triggers and the FTS implementation.

**Is SQLite really ACID with concurrent users?**
Yes: every statement is atomic and durable; transactions are serialisable; WAL lets readers proceed during a write. The limit is **one writer at a time**, which is fine for a single-node investigation tool and is demonstrated, not hidden, in the Isolation demo.

**What isolation level is this?**
SQLite transactions behave as `SERIALIZABLE`. Optimistic locking is still needed on top, because the application reads a row, lets a person edit it for minutes, and writes it back *in a different transaction*; the database alone cannot know the edit was based on stale data.

**Why is the relationship table polymorphic?**
Investigators need to link any record to any other. More than twenty separate junction tables (one per pair of record types) would be unmanageable. The cost is that `(type, id)` cannot be a real foreign key, so triggers and a rules table restore the guarantees; the Constraints demo shows them working. Links that already have a first-class table (case ↔ suspect/victim/witness) are deliberately **not** allowed in the polymorphic table, so each fact is stored once.

**Why `ON DELETE RESTRICT` almost everywhere?**
Evidence, clues and people must never silently disappear from a case. The API offers *unlink* and *archive* instead of delete, and evidence cannot be deleted at all.

**How is SQL injection prevented?**
Every query uses bound parameters (`?` / `@name`). The only values interpolated into SQL text are table and column names chosen from fixed allow-lists in code (for example sort keys and the entity registry), never from request text. `LIKE` wildcards in search terms are escaped and FTS queries are built from sanitised tokens.

**How are passwords and sessions stored?**
bcrypt hashes (cost 10) for passwords. Sessions use a random 256-bit token in an `HttpOnly` cookie; only its SHA-256 hash is stored, so a copy of the database does not let anyone hijack a session.

**Is the chain of custody tamper-proof?**
No — see 1.3. It is append-only *within the application and SQL sessions*, with automatic verification, which is the correct database-design pattern for a lab. Forensic-grade integrity needs additional controls.

**Is the graph "AI"?**
No. It is a recursive SQL traversal over rows people entered. We say "recorded association" on purpose and never label a suspect guilty.

## 5. Reproducing a demonstration by hand (SQL shell)

If you prefer to demonstrate in a SQL client, open the file with any SQLite tool (read-only is safest), for example:

```powershell
sqlite3 database/data/tracenet.db
```

```sql
PRAGMA foreign_keys = ON;       -- must be set per connection; the app does it for you
BEGIN;
UPDATE custody_log SET reason = 'x' WHERE id = 1;   -- fails: trg_custody_no_update
ROLLBACK;

EXPLAIN QUERY PLAN SELECT * FROM cases WHERE is_archived = 0 AND status = 'open';
EXPLAIN QUERY PLAN SELECT * FROM cases NOT INDEXED WHERE is_archived = 0 AND status = 'open';

SELECT * FROM v_custody_violations;                  -- expect zero rows
SELECT * FROM v_node_case_links WHERE case_count > 1; -- records that appear in 2+ cases
```

(The `sqlite3` shell is optional and is not installed by `npm run setup`; everything above is also available inside the Lab page.)
