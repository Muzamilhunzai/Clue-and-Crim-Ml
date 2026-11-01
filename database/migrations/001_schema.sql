-- =====================================================================
-- TraceNet - Crime & Clue Relationship Database
-- Migration 001: core relational schema (tables, constraints, indexes)
--
-- Design notes
--  * Every table has an INTEGER PRIMARY KEY and, where a business key
--    exists (case number, evidence code ...), a UNIQUE constraint on it.
--  * Enumerations are enforced with CHECK constraints so invalid values
--    are rejected by the database itself, not only by the API.
--  * Many-to-many associations (case <-> suspect, case <-> witness ...)
--    are resolved with junction tables that carry their own attributes
--    (involvement status, statement summary, ...). This keeps the schema
--    in third normal form.
--  * Timestamps are stored as UTC ISO-8601 text (YYYY-MM-DDTHH:MM:SSZ).
--  * Foreign keys are enforced (PRAGMA foreign_keys = ON per connection).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Users (investigators) and authentication sessions
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 40),
  full_name     TEXT    NOT NULL CHECK (length(trim(full_name)) >= 2),
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (email LIKE '%_@_%._%'),
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('chief_investigator', 'investigator', 'evidence_officer')),
  badge_number  TEXT    NOT NULL UNIQUE,
  department    TEXT,
  phone         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_login_at TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,                 -- SHA-256 of the cookie token, never the token itself
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
CREATE TABLE locations (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL CHECK (length(trim(name)) >= 2),
  address    TEXT    NOT NULL,
  city       TEXT    NOT NULL DEFAULT 'Islamabad',
  kind       TEXT    NOT NULL DEFAULT 'other'
             CHECK (kind IN ('residence', 'business', 'public_space', 'vehicle', 'online', 'government', 'other')),
  latitude   REAL    CHECK (latitude  IS NULL OR latitude  BETWEEN  -90 AND  90),
  longitude  REAL    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (name, address)
);

CREATE TABLE relationship_types (
  code        TEXT PRIMARY KEY CHECK (code = lower(code) AND code NOT LIKE '% %'),
  label       TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE counters (
  key   TEXT    PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0)
) WITHOUT ROWID;

-- ---------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------
CREATE TABLE cases (
  id            INTEGER PRIMARY KEY,
  case_number   TEXT    NOT NULL UNIQUE CHECK (case_number GLOB 'TN-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]*'),
  title         TEXT    NOT NULL CHECK (length(trim(title)) >= 3),
  description   TEXT    NOT NULL DEFAULT '',
  crime_type    TEXT    NOT NULL DEFAULT 'other'
                CHECK (crime_type IN ('theft', 'burglary', 'fraud', 'cybercrime', 'assault', 'arson', 'vandalism',
                                      'smuggling', 'missing_person', 'forgery', 'hit_and_run', 'other')),
  incident_date TEXT    NOT NULL CHECK (incident_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  location_id   INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status        TEXT    NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'investigating', 'suspect_identified', 'closed')),
  resolution    TEXT    CHECK (resolution IN ('solved', 'unsolved', 'unfounded', 'referred_to_court', 'withdrawn')),
  closed_at     TEXT,
  is_archived   INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at   TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- a case is closed  <=>  it has a closing timestamp and a resolution
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((status = 'closed') = (resolution IS NOT NULL)),
  -- a case is archived <=> it has an archive timestamp; only closed cases can be archived
  CHECK ((is_archived = 1) = (archived_at IS NOT NULL)),
  CHECK (is_archived = 0 OR status = 'closed')
);
CREATE INDEX idx_cases_status        ON cases(is_archived, status);
CREATE INDEX idx_cases_priority      ON cases(priority);
CREATE INDEX idx_cases_incident_date ON cases(incident_date);
CREATE INDEX idx_cases_location      ON cases(location_id);
CREATE INDEX idx_cases_updated       ON cases(updated_at);

CREATE TABLE case_investigators (
  case_id     INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role        TEXT    NOT NULL DEFAULT 'support' CHECK (role IN ('lead', 'support')),
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (case_id, user_id)
) WITHOUT ROWID;
CREATE INDEX idx_case_investigators_user ON case_investigators(user_id);
-- partial unique index: at most ONE lead investigator per case
CREATE UNIQUE INDEX uq_case_single_lead ON case_investigators(case_id) WHERE role = 'lead';

CREATE TABLE case_notes (
  id         INTEGER PRIMARY KEY,
  case_id    INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body       TEXT    NOT NULL CHECK (length(trim(body)) >= 1),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_case_notes_case ON case_notes(case_id, created_at);

-- ---------------------------------------------------------------------
-- People: suspects, victims, witnesses (+ junction tables to cases)
-- ---------------------------------------------------------------------
CREATE TABLE suspects (
  id                   INTEGER PRIMARY KEY,
  suspect_code         TEXT    NOT NULL UNIQUE,
  full_name            TEXT    NOT NULL CHECK (length(trim(full_name)) >= 2),
  alias                TEXT,
  gender               TEXT    NOT NULL DEFAULT 'unknown' CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  date_of_birth        TEXT    CHECK (date_of_birth IS NULL OR date_of_birth GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  occupation           TEXT,
  physical_description TEXT,
  last_known_address   TEXT,
  notes                TEXT,
  created_by           INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_suspects_name ON suspects(full_name COLLATE NOCASE);

CREATE TABLE victims (
  id            INTEGER PRIMARY KEY,
  victim_code   TEXT    NOT NULL UNIQUE,
  full_name     TEXT    NOT NULL CHECK (length(trim(full_name)) >= 2),
  victim_type   TEXT    NOT NULL DEFAULT 'individual' CHECK (victim_type IN ('individual', 'business', 'institution')),
  date_of_birth TEXT    CHECK (date_of_birth IS NULL OR date_of_birth GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  phone         TEXT,                               -- restricted fields (hidden from evidence officers)
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_victims_name ON victims(full_name COLLATE NOCASE);

CREATE TABLE witnesses (
  id           INTEGER PRIMARY KEY,
  witness_code TEXT    NOT NULL UNIQUE,
  full_name    TEXT    NOT NULL CHECK (length(trim(full_name)) >= 2),
  occupation   TEXT,
  phone        TEXT,                                -- restricted fields
  email        TEXT,
  address      TEXT,
  is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),  -- protected: contact details chief-only
  notes        TEXT,
  created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_witnesses_name ON witnesses(full_name COLLATE NOCASE);

CREATE TABLE case_suspects (
  case_id            INTEGER NOT NULL REFERENCES cases(id)    ON DELETE CASCADE,
  suspect_id         INTEGER NOT NULL REFERENCES suspects(id) ON DELETE RESTRICT,
  involvement_status TEXT    NOT NULL DEFAULT 'person_of_interest'
                     CHECK (involvement_status IN ('person_of_interest', 'under_investigation', 'questioned', 'cleared', 'charged')),
  notes              TEXT,
  linked_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (case_id, suspect_id)
) WITHOUT ROWID;
CREATE INDEX idx_case_suspects_suspect ON case_suspects(suspect_id);

CREATE TABLE case_victims (
  case_id     INTEGER NOT NULL REFERENCES cases(id)   ON DELETE CASCADE,
  victim_id   INTEGER NOT NULL REFERENCES victims(id) ON DELETE RESTRICT,
  harm_summary TEXT,
  notes       TEXT,
  linked_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (case_id, victim_id)
) WITHOUT ROWID;
CREATE INDEX idx_case_victims_victim ON case_victims(victim_id);

CREATE TABLE case_witnesses (
  case_id           INTEGER NOT NULL REFERENCES cases(id)     ON DELETE CASCADE,
  witness_id        INTEGER NOT NULL REFERENCES witnesses(id) ON DELETE RESTRICT,
  statement_summary TEXT,
  interview_date    TEXT    CHECK (interview_date IS NULL OR interview_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  follow_up_status  TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (follow_up_status IN ('none_needed', 'pending', 'scheduled', 'completed')),
  notes             TEXT,
  linked_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (case_id, witness_id)
) WITHOUT ROWID;
CREATE INDEX idx_case_witnesses_witness ON case_witnesses(witness_id);

-- ---------------------------------------------------------------------
-- Evidence and chain of custody
-- ---------------------------------------------------------------------
CREATE TABLE evidence (
  id                    INTEGER PRIMARY KEY,
  evidence_code         TEXT    NOT NULL UNIQUE,
  case_id               INTEGER NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  title                 TEXT    NOT NULL CHECK (length(trim(title)) >= 3),
  description           TEXT    NOT NULL DEFAULT '',
  category              TEXT    NOT NULL DEFAULT 'physical'
                        CHECK (category IN ('physical', 'digital', 'documentary', 'biological', 'trace', 'weapon', 'financial', 'other')),
  collected_at          TEXT    NOT NULL CHECK (collected_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'),
  collected_location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  collected_by          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status                TEXT    NOT NULL DEFAULT 'collected'
                        CHECK (status IN ('collected', 'in_storage', 'in_analysis', 'released', 'returned', 'disposed')),
  current_custodian_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_location      TEXT,
  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_evidence_case      ON evidence(case_id);
CREATE INDEX idx_evidence_status    ON evidence(status);
CREATE INDEX idx_evidence_category  ON evidence(category);
CREATE INDEX idx_evidence_custodian ON evidence(current_custodian_id);
CREATE INDEX idx_evidence_location  ON evidence(collected_location_id);

-- Append-only ledger of custody transfers (enforced by triggers in migration 002).
CREATE TABLE custody_log (
  id                INTEGER PRIMARY KEY,
  evidence_id       INTEGER NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  seq               INTEGER NOT NULL CHECK (seq >= 1),
  from_custodian_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,     -- NULL only for the intake entry
  to_custodian_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transferred_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason            TEXT    NOT NULL CHECK (length(trim(reason)) >= 3),
  storage_location  TEXT,
  transferred_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (evidence_id, seq),
  CHECK (from_custodian_id IS NULL OR from_custodian_id <> to_custodian_id)
);
CREATE INDEX idx_custody_to   ON custody_log(to_custodian_id);
CREATE INDEX idx_custody_from ON custody_log(from_custodian_id);

-- ---------------------------------------------------------------------
-- Clues
-- ---------------------------------------------------------------------
CREATE TABLE clues (
  id            INTEGER PRIMARY KEY,
  clue_code     TEXT    NOT NULL UNIQUE,
  case_id       INTEGER NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  title         TEXT    NOT NULL CHECK (length(trim(title)) >= 3),
  description   TEXT    NOT NULL DEFAULT '',
  source        TEXT,
  discovered_at TEXT    NOT NULL CHECK (discovered_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  location_id   INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  confidence    TEXT    NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('unverified', 'low', 'medium', 'high')),
  status        TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'corroborated', 'discredited')),
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_clues_case       ON clues(case_id);
CREATE INDEX idx_clues_location   ON clues(location_id);
CREATE INDEX idx_clues_status     ON clues(status);
CREATE INDEX idx_clues_confidence ON clues(confidence);

-- ---------------------------------------------------------------------
-- Relationship engine: recorded associations between any two records.
--
-- A relationship is stored ONCE in canonical order (CHECK below), so
-- A->B and B->A can never both exist; UNIQUE then blocks duplicates.
-- Associations that already have a first-class table (case<->suspect,
-- case<->victim, case<->witness) are NOT allowed here - they live in their
-- own normalised junction tables. Evidence and clues belong to exactly one
-- "home" case (FK); a case<->evidence / case<->clue row here records that the
-- item is ALSO relevant to a different case (cross-case link).
--
-- Direction: for two different entity types the direction is implied by the
-- canonical type order (case < clue < evidence < location < suspect < victim
-- < witness); same-type relationships are symmetric. Relationship type labels
-- are therefore worded neutrally ("Linked to", "Found at", ...).
-- A recorded association is an investigative lead, not a proven fact.
-- ---------------------------------------------------------------------
CREATE TABLE relationships (
  id            INTEGER PRIMARY KEY,
  a_type        TEXT    NOT NULL CHECK (a_type IN ('case', 'clue', 'evidence', 'location', 'suspect', 'victim', 'witness')),
  a_id          INTEGER NOT NULL,
  b_type        TEXT    NOT NULL CHECK (b_type IN ('case', 'clue', 'evidence', 'location', 'suspect', 'victim', 'witness')),
  b_id          INTEGER NOT NULL,
  relation_type TEXT    NOT NULL REFERENCES relationship_types(code) ON DELETE RESTRICT,
  description   TEXT    NOT NULL DEFAULT '',
  source        TEXT,
  confidence    TEXT    NOT NULL DEFAULT 'unverified' CHECK (confidence IN ('unverified', 'low', 'medium', 'high')),
  recorded_on   TEXT    NOT NULL DEFAULT (date('now')),
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (a_type < b_type OR (a_type = b_type AND a_id < b_id)),
  CHECK (NOT (a_type = 'case' AND b_type IN ('suspect', 'victim', 'witness'))),
  UNIQUE (a_type, a_id, b_type, b_id, relation_type)
);
CREATE INDEX idx_relationships_b ON relationships(b_type, b_id);

-- ---------------------------------------------------------------------
-- Audit trail (append-only, enforced by triggers in migration 002)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  action      TEXT    NOT NULL,
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER,
  case_id     INTEGER,
  summary     TEXT    NOT NULL,
  details     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_case    ON audit_log(case_id);
CREATE INDEX idx_audit_user    ON audit_log(user_id);
