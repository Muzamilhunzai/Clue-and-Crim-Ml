-- =====================================================================
-- Migration 004: optimistic concurrency, relationship vocabulary + rules,
--                graph node view
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Optimistic concurrency control on cases.
--    The API only applies an update when the caller's version still matches
--    (UPDATE ... WHERE id = ? AND version = ?), then bumps the version.
--    Two investigators editing the same case can therefore never silently
--    overwrite each other (the "lost update" anomaly).
-- ---------------------------------------------------------------------
ALTER TABLE cases ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);

-- ---------------------------------------------------------------------
-- 2. Relationship vocabulary (reference data - the engine cannot work without it)
-- ---------------------------------------------------------------------
INSERT INTO relationship_types (code, label, description) VALUES
  ('linked_to',       'Linked to',       'General association between two records that does not fit a more specific type.'),
  ('found_at',        'Found at',        'A clue or an item of evidence was found at this location.'),
  ('seen_at',         'Seen at',         'A person was reported or recorded at this location.'),
  ('points_to',       'Points to',       'A clue or evidence item suggests this suspect may be involved. A lead, not proof.'),
  ('belongs_to',      'Belongs to',      'The evidence item is owned by, or was taken from, this person.'),
  ('mentions',        'Mentions',        'The content of the record refers to the other record.'),
  ('corroborates',    'Corroborates',    'Independent support for the other record. Still needs verification.'),
  ('contradicts',     'Contradicts',     'Conflicts with the other record.'),
  ('acquainted_with', 'Acquainted with', 'The two people are known to each other.'),
  ('identified_by',   'Identified by',   'A witness identified or described the other record.'),
  ('related_case',    'Related to',      'The records are relevant to more than one case.');

-- ---------------------------------------------------------------------
-- 3. Which relationship types are permitted between which record types.
--    Type names are stored in canonical (alphabetical) order, matching the
--    CHECK (a_type < b_type ...) on the relationships table.
--    case<->suspect/victim/witness is NOT here: those use junction tables.
-- ---------------------------------------------------------------------
CREATE TABLE relationship_rules (
  a_type        TEXT NOT NULL CHECK (a_type IN ('case','clue','evidence','location','suspect','victim','witness')),
  b_type        TEXT NOT NULL CHECK (b_type IN ('case','clue','evidence','location','suspect','victim','witness')),
  relation_type TEXT NOT NULL REFERENCES relationship_types(code) ON DELETE CASCADE,
  PRIMARY KEY (a_type, b_type, relation_type),
  CHECK (a_type <= b_type)
) WITHOUT ROWID;

-- Generic fallback: "linked to" between any two record types (except the junction-table pairs)
WITH t(x) AS (VALUES ('case'),('clue'),('evidence'),('location'),('suspect'),('victim'),('witness'))
INSERT INTO relationship_rules (a_type, b_type, relation_type)
SELECT a.x, b.x, 'linked_to'
  FROM t a JOIN t b ON a.x <= b.x
 WHERE NOT (a.x = 'case' AND b.x IN ('suspect', 'victim', 'witness'));

INSERT INTO relationship_rules (a_type, b_type, relation_type) VALUES
  ('clue','location','found_at'),     ('evidence','location','found_at'),
  ('location','suspect','seen_at'),   ('location','victim','seen_at'),   ('location','witness','seen_at'),
  ('clue','suspect','points_to'),     ('evidence','suspect','points_to'),
  ('evidence','suspect','belongs_to'),('evidence','victim','belongs_to'),
  ('clue','evidence','mentions'),     ('clue','location','mentions'),
  ('clue','suspect','mentions'),      ('clue','victim','mentions'),       ('clue','witness','mentions'),
  ('clue','clue','corroborates'),     ('clue','evidence','corroborates'), ('clue','witness','corroborates'),
  ('evidence','evidence','corroborates'), ('evidence','witness','corroborates'), ('witness','witness','corroborates'),
  ('clue','clue','contradicts'),      ('clue','evidence','contradicts'),  ('clue','witness','contradicts'),
  ('evidence','evidence','contradicts'), ('evidence','witness','contradicts'), ('witness','witness','contradicts'),
  ('suspect','suspect','acquainted_with'), ('suspect','victim','acquainted_with'), ('suspect','witness','acquainted_with'),
  ('victim','victim','acquainted_with'),   ('victim','witness','acquainted_with'), ('witness','witness','acquainted_with'),
  ('clue','witness','identified_by'), ('evidence','witness','identified_by'), ('suspect','witness','identified_by'),
  ('case','case','related_case'),     ('case','clue','related_case'),     ('case','evidence','related_case');

CREATE TRIGGER trg_relationship_rules BEFORE INSERT ON relationships
WHEN NOT EXISTS (SELECT 1 FROM relationship_rules
                  WHERE a_type = NEW.a_type AND b_type = NEW.b_type AND relation_type = NEW.relation_type)
BEGIN SELECT RAISE(ABORT, 'this relationship type is not permitted between these record types'); END;

-- ---------------------------------------------------------------------
-- 4. One row per record that can appear as a node in the relationship graph.
-- ---------------------------------------------------------------------
CREATE VIEW v_graph_nodes AS
  SELECT 'case' AS entity_type, id AS entity_id, case_number AS code, title AS label,
         crime_type AS subtitle, status, id AS home_case_id FROM cases
  UNION ALL
  SELECT 'suspect', id, suspect_code, full_name, COALESCE(alias, occupation, ''), NULL, NULL FROM suspects
  UNION ALL
  SELECT 'victim', id, victim_code, full_name, victim_type, NULL, NULL FROM victims
  UNION ALL
  SELECT 'witness', id, witness_code, full_name, COALESCE(occupation, ''), NULL, NULL FROM witnesses
  UNION ALL
  SELECT 'evidence', id, evidence_code, title, category, status, case_id FROM evidence
  UNION ALL
  SELECT 'clue', id, clue_code, title, COALESCE(source, ''), status, case_id FROM clues
  UNION ALL
  SELECT 'location', id, 'LOC-' || printf('%03d', id), name, kind, NULL, NULL FROM locations;

-- Number of DISTINCT cases each record is connected to (multi-case = investigative hub).
CREATE VIEW v_node_case_links AS
  SELECT src_type AS entity_type, src_id AS entity_id, COUNT(DISTINCT dst_id) AS case_count
    FROM v_graph_edges_undirected
   WHERE dst_type = 'case' AND src_type <> 'case'
   GROUP BY src_type, src_id;
