# TraceNet — Entity-Relationship Diagram and Schema Notes

The authoritative definition is in `database/migrations/` (generated into `database/schema.sql` by `npm run db:schema`). This page explains it.

GitHub, VS Code (with a Mermaid extension) and most Markdown viewers render the diagrams below.

## 1. Core ER diagram

`relationships` is drawn separately in section 2, because it is a *polymorphic* table that points at seven different tables and cannot be expressed with ordinary foreign keys.

```mermaid
erDiagram
  users ||--o{ sessions : "has"
  users ||--o{ cases : "created_by"
  users ||--o{ case_investigators : "assigned"
  cases ||--o{ case_investigators : "is worked by"
  users ||--o{ case_notes : "writes"
  cases ||--o{ case_notes : "has"

  locations |o--o{ cases : "occurred at"
  locations |o--o{ clues : "found at"
  locations |o--o{ evidence : "collected at"

  cases ||--o{ case_suspects : ""
  suspects ||--o{ case_suspects : ""
  cases ||--o{ case_victims : ""
  victims ||--o{ case_victims : ""
  cases ||--o{ case_witnesses : ""
  witnesses ||--o{ case_witnesses : ""

  cases ||--o{ evidence : "home case"
  cases ||--o{ clues : "home case"
  evidence ||--|{ custody_log : "chain of custody"
  users ||--o{ custody_log : "from / to / by"
  users ||--o{ evidence : "collected_by, current custodian"

  users |o--o{ audit_log : "acts"

  users {
    int id PK
    text username UK
    text email UK
    text password_hash
    text role "chief_investigator | investigator | evidence_officer"
    text badge_number UK
    int is_active
  }
  sessions {
    text token_hash PK "SHA-256 of cookie token"
    int user_id FK
    text expires_at
  }
  cases {
    int id PK
    text case_number UK "TN-YYYY-NNNN"
    text title
    text crime_type
    text incident_date
    int location_id FK
    text priority "low..critical"
    text status "open | investigating | suspect_identified | closed"
    text resolution "required when closed"
    int is_archived "only closed cases"
    int version "optimistic locking"
    int created_by FK
  }
  case_investigators {
    int case_id PK,FK
    int user_id PK,FK
    text role "lead | support (one lead per case)"
  }
  case_notes {
    int id PK
    int case_id FK
    int user_id FK
    text body
  }
  suspects {
    int id PK
    text suspect_code UK
    text full_name
    text alias
    text occupation
  }
  victims {
    int id PK
    text victim_code UK
    text full_name
    text victim_type "individual | business | institution"
    text phone "restricted"
  }
  witnesses {
    int id PK
    text witness_code UK
    text full_name
    int is_protected
    text phone "restricted"
  }
  case_suspects {
    int case_id PK,FK
    int suspect_id PK,FK
    text involvement_status "person_of_interest .. charged"
  }
  case_victims {
    int case_id PK,FK
    int victim_id PK,FK
    text harm_summary
  }
  case_witnesses {
    int case_id PK,FK
    int witness_id PK,FK
    text statement_summary
    text follow_up_status
  }
  locations {
    int id PK
    text name
    text address
    text kind
    real latitude
    real longitude
  }
  evidence {
    int id PK
    text evidence_code UK
    int case_id FK
    text category
    text status
    int current_custodian_id FK
  }
  custody_log {
    int id PK
    int evidence_id FK
    int seq "UK with evidence_id"
    int from_custodian_id FK "NULL only at intake"
    int to_custodian_id FK
    text reason
  }
  clues {
    int id PK
    text clue_code UK
    int case_id FK
    text confidence
    text status
  }
  audit_log {
    int id PK
    int user_id FK
    text action
    text entity_type
    int entity_id
    int case_id
  }
```

## 2. The relationship engine tables

```mermaid
erDiagram
  relationship_types ||--o{ relationships : "relation_type"
  relationship_types ||--o{ relationship_rules : "allowed for"
  users ||--o{ relationships : "created_by"

  relationships {
    int id PK
    text a_type "case|clue|evidence|location|suspect|victim|witness"
    int a_id "points at the table named by a_type"
    text b_type "same list; a_type < b_type or (same type and a_id < b_id)"
    int b_id
    text relation_type FK
    text confidence "unverified | low | medium | high"
    text source
    int created_by FK
  }
  relationship_types {
    text code PK "linked_to, found_at, seen_at, points_to ..."
    text label
  }
  relationship_rules {
    text a_type PK
    text b_type PK
    text relation_type PK,FK
  }
```

**Why a polymorphic table?** The graph must connect *any* record to *any* other (a clue to a location, evidence to a suspect, one case to another). A separate junction table for each of the 21 type pairs would be unmanageable, so there is one table whose endpoints are `(type, id)` pairs.

SQLite cannot declare a foreign key whose target table depends on a column, so the integrity that foreign keys would normally give is rebuilt in the database itself:

| Rule | Mechanism |
| --- | --- |
| Each edge is stored once, in canonical order (A→B and B→A cannot both exist) | `CHECK (a_type < b_type OR (a_type = b_type AND a_id < b_id))` |
| No duplicates | `UNIQUE (a_type, a_id, b_type, b_id, relation_type)` |
| Both endpoints exist | `BEFORE INSERT` trigger `trg_relationship_endpoints` |
| Only meaningful link types between two record kinds (e.g. *found at* only for clue/evidence ↔ location) | `relationship_rules` table + trigger `trg_relationship_rules` |
| Case ↔ suspect / victim / witness are **not** allowed here | `CHECK` — those links live in normalised junction tables |
| A "cross-case" link must point to a *different* case than the item's home case | trigger `trg_relationship_endpoints` |
| Deleting a record removes its edges | `AFTER DELETE` cleanup triggers on all seven tables |

The graph read-model is built from views:

* `v_graph_nodes` — one row per record that can appear as a node
* `v_graph_edges` — every edge, including the *implicit* ones from junction tables and `case_id` foreign keys, unioned with the explicit `relationships` rows
* `v_graph_edges_undirected` — both directions of each edge, used by the recursive traversal
* `v_node_degree`, `v_node_case_links` — hub detection (records connected to two or more cases)

## 3. Relationship cardinalities

| Relationship | Cardinality | Implemented by |
| --- | --- | --- |
| Case ↔ Suspect | many-to-many | `case_suspects` (adds `involvement_status`, notes) |
| Case ↔ Victim | many-to-many | `case_victims` (adds `harm_summary`) |
| Case ↔ Witness | many-to-many | `case_witnesses` (adds `statement_summary`, `interview_date`, `follow_up_status`) |
| Case ↔ Investigator | many-to-many | `case_investigators` (adds `role`; partial unique index = one lead) |
| Case → Evidence | one-to-many (home case) | `evidence.case_id` |
| Case → Clue | one-to-many (home case) | `clues.case_id` |
| Evidence → Custody entries | one-to-many, ordered | `custody_log (evidence_id, seq)` |
| Case → Location | many-to-one, optional | `cases.location_id` |
| Any record ↔ any record | many-to-many | `relationships` |

## 4. Normalisation

The schema is in **third normal form** (and BCNF for all tables with a single candidate key):

* **1NF** — all columns are atomic; there are no repeating groups. Lists such as a case's suspects or an evidence item's custody history are rows in their own tables, not comma-separated values.
* **2NF** — in tables with composite keys (`case_suspects`, `case_victims`, `case_witnesses`, `case_investigators`) every non-key column describes the *pair*, not half of it: *involvement status* belongs to "this suspect in this case", not to the suspect or the case alone. That is the reason these are junction tables and not columns on `suspects`.
* **3NF** — no non-key column depends on another non-key column. A suspect's name is stored once in `suspects`; cases refer to it by key. A person's role is stored in `users`, not copied into `case_investigators`. Reference vocabularies (`relationship_types`, `relationship_rules`) are tables, not repeated strings.

**Deliberate, documented trade-offs**

* `evidence.current_custodian_id` duplicates what could be derived from the `to_custodian_id` of the last `custody_log` row. This is a controlled denormalisation so lists and filters do not need a join and a "latest row" subquery on every request. The `trg_custody_chain` trigger guards how new entries are added, and the view `v_custody_violations` reports any evidence item whose stored custodian differs from its ledger (it should always return zero rows; the ADBMS Lab health tab shows this).
* `audit_log.case_id` and `audit_log.entity_id` are plain integers, not foreign keys, because an audit row can refer to any of several tables. Only `user_id` is a real foreign key.

## 5. Integrity features by table

| Feature | Where |
| --- | --- |
| Enumerations enforced by `CHECK` | status, priority, crime type, role, confidence, category, follow-up status … |
| Date/time format checks | `GLOB 'YYYY-MM-DD'` checks on all date columns |
| Cross-column rules | A case is closed ⇔ it has `closed_at` **and** a `resolution`; only closed cases can be archived |
| Partial unique index | `uq_case_single_lead` — at most one lead investigator per case |
| `ON DELETE RESTRICT` | People, evidence and clues cannot vanish from under a case; the API offers *unlink* and *archive* instead |
| `ON DELETE CASCADE` | Only on dependent rows that have no meaning alone (sessions, case notes, junction rows when a case is deleted) |
| Append-only tables | `custody_log`, `audit_log` — `BEFORE UPDATE` / `BEFORE DELETE` triggers raise an error |
| Custody chain | Trigger `trg_custody_chain` — intake has no previous custodian; sequence numbers have no gaps; `from` must equal the last holder; disposed items cannot move |
| Archived cases are read-only | `BEFORE INSERT` triggers on evidence, clues and the people junction tables |
| `updated_at` maintenance | `AFTER UPDATE` touch triggers; child inserts also touch their parent case so the board's "recently updated" sort is truthful |
| Full-text search | FTS5 virtual table `search_index`, kept in sync by insert/update/delete triggers on seven tables |
| Optimistic concurrency | `cases.version`; updates run `WHERE id = ? AND version = ?` |

## 6. Indexes

| Index | Serves |
| --- | --- |
| `idx_cases_status (is_archived, status)` | Board columns and status filters |
| `idx_cases_priority`, `idx_cases_incident_date`, `idx_cases_updated`, `idx_cases_location` | Filters and sorts on the list/board |
| `idx_evidence_case`, `idx_clues_case` | Foreign-key lookups: "evidence of this case" |
| `idx_evidence_status / category / custodian / location` | Evidence filters and joins |
| `idx_case_suspects_suspect` (and victim/witness/investigator equivalents) | Reverse lookup: "which cases involve this person?" — the junction's primary key covers only the case → person direction |
| `idx_suspects_name` (`COLLATE NOCASE`) | Case-insensitive name lookup |
| `idx_relationships_b (b_type, b_id)` | The unique key covers lookups from endpoint A; this covers endpoint B |
| `UNIQUE (evidence_id, seq)` | Latest custody entry, ordered chain |
| `idx_audit_created / entity / case / user` | Activity log filters |
| `idx_sessions_user`, `idx_sessions_expires` | Sign out everywhere, expiry purge |

The ADBMS Lab's **Query plans** tab shows `EXPLAIN QUERY PLAN` output for these (e.g. `SEARCH … USING INDEX` versus `SCAN`).
