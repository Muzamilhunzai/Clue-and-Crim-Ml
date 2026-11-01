# TraceNet REST API

Base URL in development: `http://localhost:5173/api` (proxied by Vite) or `http://localhost:4000/api` (direct).
All requests and responses are JSON. Property names are `snake_case`, except a few dashboard aggregates (`byStatus`, `byPriority`, `byCrimeType`, `recentActivity`, `multiCase`, `topConnected`, `topCases`). Dates are `YYYY-MM-DD`; timestamps are UTC ISO-8601 (`2026-10-31T09:15:00Z`).

## 1. Conventions

### Authentication

`POST /api/auth/login` sets an `HttpOnly; SameSite=Lax` cookie named `tn_session`. Every other endpoint (except `/api/health`, `/api/auth/login` and `/api/auth/demo`) requires that cookie. The cookie value is a random token; the database stores only its SHA-256 hash.

### CSRF defence

Every `POST`, `PATCH` and `DELETE` must include the header

```
X-TraceNet-Client: web
```

and, if an `Origin` header is present, it must match the server's host or `CLIENT_ORIGIN`. A plain HTML form on another site can set neither, so cross-site form posts are rejected with `403`.

### Error format

Every failure has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please correct the highlighted fields.", "details": { "fields": { "title": "Use at least 3 characters." } } } }
```

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `BAD_REQUEST`, `BAD_JSON` | Malformed request |
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `INVALID_CREDENTIALS` | Wrong sign-in details (one message for wrong user *or* password) |
| 403 | `FORBIDDEN` | Your role (or your assignment to the case) does not allow this |
| 403 | `CSRF` | Missing `X-TraceNet-Client` header, or a foreign `Origin` |
| 404 | `NOT_FOUND` | Record or route does not exist |
| 409 | `DUPLICATE`, `DUPLICATE_RELATIONSHIP`, `REFERENCED`, `CASE_ARCHIVED`, `VERSION_CONFLICT`, … | Conflicts with existing data or state |
| 413 | `TOO_LARGE` | Body larger than 100 kB |
| 422 | `VALIDATION_ERROR` | Field-level problems, in `error.details.fields` |
| 429 | `TOO_MANY_ATTEMPTS` | Login rate limit (10 failed attempts per 15 minutes per address; successful sign-ins do not count) |
| 500 | `INTERNAL` | Unexpected; details go to the server log only |

Database constraint failures (`UNIQUE`, `FOREIGN KEY`, `CHECK`, trigger `RAISE`) are translated into the 409/422 responses above, with a message written for people.

### Pagination, search, sorting (list endpoints)

| Query parameter | Meaning |
| --- | --- |
| `page` | 1-based page number (default 1) |
| `pageSize` | 1–100 (default 20) |
| `q` | Text filter (max 100 characters; LIKE wildcards are escaped) |
| `sort`, `order` | Sort key from a fixed allow-list for that endpoint; `order` = `asc` or `desc`. Unknown keys fall back to the default sort. |
| *filters* | Endpoint-specific, e.g. `status`, `priority`, `crime_type`, `category` |

List responses: `{ "items": [...], "total": 42, "page": 1, "pageSize": 20 }`.

### Roles

| Role | Can do |
| --- | --- |
| `chief_investigator` | Everything |
| `investigator` | Create cases; edit cases they are assigned to; manage people, clues, locations, evidence intake and relationships on those cases; view sensitive details |
| `evidence_officer` | Record evidence, edit evidence, transfer custody, manage locations; **cannot** view restricted personal details or edit cases |

All roles can read cases, records, the graph, search, the activity log and the dashboard. Restricted *fields* (contact details of victims and witnesses, and of protected witnesses) are removed from the response for roles without the matching permission. The permission matrix is in `server/src/domain/permissions.ts`; the current user's list is returned by `GET /api/meta` and `POST /api/auth/login`.

---

## 2. Authentication — `/api/auth`

| Method & path | Role | Body / notes | Success |
| --- | --- | --- | --- |
| `POST /login` | public | `{ "login": "chief", "password": "…" }` (`login` is a username or an email) | `200 { user, permissions }` + cookie |
| `POST /logout` | signed in | — | `200 { ok: true }`, cookie cleared, session deleted |
| `GET /me` | signed in | — | `200 { user, permissions }` |
| `POST /change-password` | signed in | `{ current_password, new_password }` (≥ 10 chars, a letter and a digit) | `200 { ok: true }`; **all other sessions of the user are ended** |
| `GET /demo` | public, only when `DEMO_MODE=true` | — | list of demo accounts and the demo password |

## 3. Cases — `/api/cases`

| Method & path | Role | Description |
| --- | --- | --- |
| `GET /` | any | Paged list. Filters: `status`, `priority`, `crime_type`, `assignee` (`me` or a user id), `archived` (`exclude` = default, `only`, or `include`), `q` |
| `GET /board` | any | The four dashboard columns in one query (window functions). Each column: `{ status, total, items[] }`. Accepts `q`, `priority`, `crime_type`, `assignee`, `sort`, `order` |
| `GET /options` | any | Light list of cases for pickers |
| `POST /` | `case:create` | `{ title, crime_type, incident_date, description?, priority?, location_id?, lead_id?, support_ids? }`. One **transaction**: case number allocation, case, assignments, audit entry |
| `GET /:id` | any | Case detail: people, evidence, clues, investigators, notes, activity, `version` |
| `PATCH /:id` | assigned investigator / chief | Partial update **plus the `version` you loaded**. `409 VERSION_CONFLICT` if someone else saved first (optimistic locking) |
| `PATCH /:id/status` | assigned investigator / chief | `{ status, resolution?, version? }`. Moving to `closed` requires a `resolution` (`solved`, `unsolved`, `unfounded`, `referred_to_court`, `withdrawn`) |
| `POST /:id/archive`, `POST /:id/unarchive` | `case:archive` (chief) | Only closed cases can be archived. Archived cases are read-only |
| `POST /:id/investigators` | `case:assign` (chief) | `{ user_id, role: "lead" \| "support" }`. Assigning a new lead demotes the old one, atomically |
| `DELETE /:id/investigators/:userId` | `case:assign` | Unassign |
| `POST /:id/notes` | assigned / chief | `{ body }` (≤ 2000 chars) |
| `POST /:id/:kind` | assigned / chief | Link a person; `:kind` = `suspects`, `victims` or `witnesses`. Body e.g. `{ suspect_id, involvement_status?, notes? }`, `{ victim_id, harm_summary? }`, `{ witness_id, statement_summary?, interview_date?, follow_up_status? }` |
| `PATCH /:id/:kind/:entityId` | assigned / chief | Update the link's own attributes |
| `DELETE /:id/:kind/:entityId` | assigned / chief | Unlink (the person record is kept) |

There is no endpoint that deletes a case: cases are closed and archived, never erased.

## 4. Records — suspects, victims, witnesses, locations, clues, evidence

Each type is mounted at `/api/suspects`, `/api/victims`, `/api/witnesses`, `/api/locations`, `/api/clues` and `/api/evidence` with the same five operations:

| Method & path | Description |
| --- | --- |
| `GET /api/<type>` | Paged list (`q`, `sort`, `order`, type-specific filters such as `status`, `category`, `confidence`, `case_id`) |
| `POST /api/<type>` | Create. Clues and evidence require `case_id`; the caller must be assigned to that case (chief: any case). Evidence creation also writes the intake custody entry in the same transaction |
| `GET /api/<type>/:id` | Detail, including the cases the record appears in and its relationships |
| `PATCH /api/<type>/:id` | Partial update |
| `DELETE /api/<type>/:id` | Delete. `409 REFERENCED` if the record is still linked. **Evidence cannot be deleted**: set its status to `disposed` |

Create/update bodies are validated with zod; invalid fields come back as `422` with `details.fields`.

### Chain of custody (evidence only)

| Method & path | Role | Description |
| --- | --- | --- |
| `GET /api/evidence/:id/custody` | any | `{ entries[], check }`. `entries` is the ordered ledger (with custodian names); `check` is `{ ok, entries, problems[] }`, recomputed from the rows on every request |
| `POST /api/evidence/:id/custody` | `custody:transfer` | `{ to_custodian_id, reason, storage_location?, status? }`. One transaction: append ledger row, update current custodian/status, write audit entry |

The ledger has no update or delete endpoint, and database triggers refuse such statements even if issued directly.

## 5. Relationship engine — `/api/relationships`

References use the form `type:id`, e.g. `case:3`, `suspect:12`, `location:5`. Types: `case`, `clue`, `evidence`, `location`, `suspect`, `victim`, `witness`.

| Method & path | Role | Description |
| --- | --- | --- |
| `GET /graph?focus=case:3&depth=2` | any | Nodes and edges within 1–3 hops of the focus, computed by a recursive CTE over `v_graph_edges_undirected`. Response: `{ focus, depth, requested_depth, truncated, nodes, edges, counts }`. Capped at 120 nodes: if the neighbourhood is bigger, the depth is lowered and `depth` < `requested_depth`. Each node has `case_count` (records in 2+ cases are hubs); each edge has `kind`, `label`, `confidence`, `source_table` |
| `GET /node/:ref` | any | One record with all its connections |
| `GET /lookup?type=suspect&q=ali` | any | Typeahead for the "add relationship" dialog |
| `GET /rules` | any | Allowed relationship types per pair of record types (from `relationship_rules`) |
| `GET /hotspots` | any | `{ multiCase[], topConnected[], topCases[] }`: records connected to two or more cases, most-connected records, most-connected cases |
| `GET /path?from=suspect:1&to=location:4&max=5` | any | Shortest chain of recorded associations between two records (≤ `max` hops, default 5): `{ found, nodes, edges }`; `found: false` with empty lists when no chain exists |
| `POST /` | `relationship:write` | `{ a_type, a_id, b_type, b_id, relation_type, description?, source?, confidence? }`. The server stores it in canonical order. A case ↔ suspect/victim/witness request is routed to the proper junction table |
| `PATCH /:id` | `relationship:write` | Update description, source or confidence |
| `DELETE /:edgeId` | `relationship:write` | Edge ids look like `relationships:12`; edges that come from junction tables (e.g. `case_suspects:3:7`) are unlinked from their own table |

The graph is read-only evidence of what has been *recorded*. It does not infer anything, and an edge is an investigative lead, not a conclusion.

## 6. Investigators — `/api/investigators`

| Method & path | Role | Description |
| --- | --- | --- |
| `GET /` | any | List with workload (`v_investigator_workload`); contact details only for roles with `investigator:view_contact` |
| `GET /:id` | any | Profile and assigned cases |
| `POST /` | `investigator:manage` | Create an account: `{ username, full_name, email, role, badge_number, department?, phone?, password }` |
| `PATCH /:id` | `investigator:manage` | Edit, change role, deactivate. The last active chief investigator cannot be demoted or deactivated |
| `POST /:id/reset-password` | `investigator:manage` | `{ password }` (same rules as above); ends that user's sessions |

Password hashes are never returned by any endpoint.

## 7. Dashboard, search, activity, lookups

| Method & path | Description |
| --- | --- |
| `GET /api/dashboard?tz=<minutes>` | `{ totals, byStatus, byPriority, byCrimeType, evidence, counts, mine, weekly, trend, recentActivity, hubs, integrity }`: counters, clearance rate, weekly activity (this week and the week before), trend, cases assigned to the caller, hubs, integrity check results. `tz` is the browser's UTC offset in minutes so "today" is the user's day |
| `GET /api/search?q=text` | FTS5 search over cases, suspects, victims, witnesses, evidence, clues and locations (top 20, ranked). Malformed search syntax returns an empty list, never a 500 |
| `GET /api/activity` | Audit trail, newest first. Filters `entity_type`, `user_id`, `case_id`, `q`; paged |
| `GET /api/meta` | Enumerations (statuses, priorities, crime types …) and the caller's permissions |
| `GET /api/lookups` | Users, cases and locations for dropdowns |
| `GET /api/health` | `{ ok: true, time }`; no authentication |

## 8. ADBMS Lab — `/api/lab` (chief investigator only)

| Method & path | Description |
| --- | --- |
| `GET /overview` | SQLite version, foreign-key and journal mode, busy timeout, integrity-check result, foreign-key and custody violation counts, file size, per-table row counts, schema objects, applied migrations |
| `GET /schema` | Tables, columns, indexes, triggers and views from `sqlite_master` and `PRAGMA` |
| `GET /plans` | `EXPLAIN QUERY PLAN` for a fixed set of queries, with measured timings |
| `GET /views`, `GET /views/:name` | Names and a 25-row preview of a database view |
| `GET /demos` | The six demonstrations |
| `POST /demos/:id` | Runs a demonstration inside a transaction that is **always rolled back**, so no data persists. `id` ∈ `atomicity`, `custody-rules`, `constraints`, `savepoints`, `lost-update`, `isolation`. Returns `{ steps[], takeaway, persisted: false }` where each step shows the SQL and what the database answered |

The Lab never accepts SQL from the client; the statements are fixed in `server/src/services/labService.ts`.

---

## 9. Example session (curl)

```bash
# 1. sign in and keep the cookie
curl -i -c jar.txt -H "Content-Type: application/json" -H "X-TraceNet-Client: web" \
     -d '{"login":"chief","password":"TraceNet@2026"}' http://localhost:4000/api/auth/login

# 2. read (no CSRF header needed for GET)
curl -b jar.txt http://localhost:4000/api/cases/board

# 3. write
curl -b jar.txt -H "Content-Type: application/json" -H "X-TraceNet-Client: web" \
     -d '{"title":"Stolen delivery van","crime_type":"theft","incident_date":"2026-10-20","priority":"high"}' \
     http://localhost:4000/api/cases

# 4. shortest connection between two records
curl -b jar.txt "http://localhost:4000/api/relationships/path?from=suspect:1&to=location:4"
```

Windows PowerShell users can use `curl.exe` (not the `curl` alias) with the same arguments, or `Invoke-RestMethod -WebSession`.
