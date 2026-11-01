-- =====================================================================
-- Migration 002: triggers (business rules, integrity) and views
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Housekeeping: keep updated_at current
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_users_touch     AFTER UPDATE ON users     FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE users     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_cases_touch     AFTER UPDATE ON cases     FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE cases     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_suspects_touch  AFTER UPDATE ON suspects  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE suspects  SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_victims_touch   AFTER UPDATE ON victims   FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE victims   SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_witnesses_touch AFTER UPDATE ON witnesses FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE witnesses SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_evidence_touch  AFTER UPDATE ON evidence  FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE evidence  SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_clues_touch     AFTER UPDATE ON clues     FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE clues     SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;
CREATE TRIGGER trg_locations_touch AFTER UPDATE ON locations FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN UPDATE locations SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.id; END;

-- Linking / unlinking records "touches" the case so the board shows recent activity.
CREATE TRIGGER trg_case_suspects_touch AFTER INSERT ON case_suspects FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;
CREATE TRIGGER trg_case_victims_touch AFTER INSERT ON case_victims FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;
CREATE TRIGGER trg_case_witnesses_touch AFTER INSERT ON case_witnesses FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;
CREATE TRIGGER trg_evidence_touch_case AFTER INSERT ON evidence FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;
CREATE TRIGGER trg_clues_touch_case AFTER INSERT ON clues FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;
CREATE TRIGGER trg_notes_touch_case AFTER INSERT ON case_notes FOR EACH ROW
BEGIN UPDATE cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = NEW.case_id; END;

-- ---------------------------------------------------------------------
-- 2. Append-only ledgers: chain of custody and audit log
--    UPDATE and DELETE are rejected by the database itself, so even a
--    bug in the API (or a hand-written SQL statement) cannot rewrite the
--    ledger. (This is tamper-RESISTANCE inside the application, not
--    tamper-PROOF forensic storage: anyone with file access can still
--    replace the .db file or drop the triggers.)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_custody_no_update BEFORE UPDATE ON custody_log
BEGIN SELECT RAISE(ABORT, 'custody_log is append-only: updates are not permitted'); END;
CREATE TRIGGER trg_custody_no_delete BEFORE DELETE ON custody_log
BEGIN SELECT RAISE(ABORT, 'custody_log is append-only: deletes are not permitted'); END;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: updates are not permitted'); END;
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: deletes are not permitted'); END;

-- Chain-of-custody consistency: every new entry must continue the chain.
--   seq 1            -> intake entry, from_custodian_id must be NULL
--   seq n (n > 1)    -> n must be previous seq + 1 and from_custodian_id must equal
--                       the previous entry's to_custodian_id
--   disposed items cannot be transferred
CREATE TRIGGER trg_custody_chain BEFORE INSERT ON custody_log
BEGIN
  SELECT RAISE(ABORT, 'custody chain: first entry must be an intake (no previous custodian)')
   WHERE NEW.seq = 1 AND NEW.from_custodian_id IS NOT NULL;
  SELECT RAISE(ABORT, 'custody chain: sequence number must follow the previous entry')
   WHERE NEW.seq > 1
     AND NEW.seq <> (SELECT COALESCE(MAX(seq), 0) + 1 FROM custody_log WHERE evidence_id = NEW.evidence_id);
  SELECT RAISE(ABORT, 'custody chain: previous custodian does not match the last recorded holder')
   WHERE NEW.seq > 1
     AND NEW.from_custodian_id IS NOT (SELECT to_custodian_id FROM custody_log
                                        WHERE evidence_id = NEW.evidence_id ORDER BY seq DESC LIMIT 1);
  SELECT RAISE(ABORT, 'custody chain: disposed evidence cannot be transferred')
   WHERE NEW.seq > 1 AND (SELECT status FROM evidence WHERE id = NEW.evidence_id) = 'disposed';
END;

-- ---------------------------------------------------------------------
-- 3. Business rule: archived cases are read-only for new linked records
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_archived_case_evidence BEFORE INSERT ON evidence
WHEN (SELECT is_archived FROM cases WHERE id = NEW.case_id) = 1
BEGIN SELECT RAISE(ABORT, 'case is archived: records cannot be added'); END;
CREATE TRIGGER trg_archived_case_clues BEFORE INSERT ON clues
WHEN (SELECT is_archived FROM cases WHERE id = NEW.case_id) = 1
BEGIN SELECT RAISE(ABORT, 'case is archived: records cannot be added'); END;
CREATE TRIGGER trg_archived_case_suspects BEFORE INSERT ON case_suspects
WHEN (SELECT is_archived FROM cases WHERE id = NEW.case_id) = 1
BEGIN SELECT RAISE(ABORT, 'case is archived: records cannot be added'); END;
CREATE TRIGGER trg_archived_case_victims BEFORE INSERT ON case_victims
WHEN (SELECT is_archived FROM cases WHERE id = NEW.case_id) = 1
BEGIN SELECT RAISE(ABORT, 'case is archived: records cannot be added'); END;
CREATE TRIGGER trg_archived_case_witnesses BEFORE INSERT ON case_witnesses
WHEN (SELECT is_archived FROM cases WHERE id = NEW.case_id) = 1
BEGIN SELECT RAISE(ABORT, 'case is archived: records cannot be added'); END;

-- Only active investigators may be assigned to a case.
CREATE TRIGGER trg_assign_active_only BEFORE INSERT ON case_investigators
WHEN (SELECT is_active FROM users WHERE id = NEW.user_id) = 0
BEGIN SELECT RAISE(ABORT, 'inactive investigators cannot be assigned to a case'); END;

-- ---------------------------------------------------------------------
-- 4. Relationship engine integrity (polymorphic references cannot use FKs)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_relationship_endpoints BEFORE INSERT ON relationships
BEGIN
  SELECT RAISE(ABORT, 'relationship endpoint A does not exist')
   WHERE NOT EXISTS (
     SELECT 1 FROM cases     WHERE NEW.a_type = 'case'     AND id = NEW.a_id UNION ALL
     SELECT 1 FROM clues     WHERE NEW.a_type = 'clue'     AND id = NEW.a_id UNION ALL
     SELECT 1 FROM evidence  WHERE NEW.a_type = 'evidence' AND id = NEW.a_id UNION ALL
     SELECT 1 FROM locations WHERE NEW.a_type = 'location' AND id = NEW.a_id UNION ALL
     SELECT 1 FROM suspects  WHERE NEW.a_type = 'suspect'  AND id = NEW.a_id UNION ALL
     SELECT 1 FROM victims   WHERE NEW.a_type = 'victim'   AND id = NEW.a_id UNION ALL
     SELECT 1 FROM witnesses WHERE NEW.a_type = 'witness'  AND id = NEW.a_id);
  SELECT RAISE(ABORT, 'relationship endpoint B does not exist')
   WHERE NOT EXISTS (
     SELECT 1 FROM cases     WHERE NEW.b_type = 'case'     AND id = NEW.b_id UNION ALL
     SELECT 1 FROM clues     WHERE NEW.b_type = 'clue'     AND id = NEW.b_id UNION ALL
     SELECT 1 FROM evidence  WHERE NEW.b_type = 'evidence' AND id = NEW.b_id UNION ALL
     SELECT 1 FROM locations WHERE NEW.b_type = 'location' AND id = NEW.b_id UNION ALL
     SELECT 1 FROM suspects  WHERE NEW.b_type = 'suspect'  AND id = NEW.b_id UNION ALL
     SELECT 1 FROM victims   WHERE NEW.b_type = 'victim'   AND id = NEW.b_id UNION ALL
     SELECT 1 FROM witnesses WHERE NEW.b_type = 'witness'  AND id = NEW.b_id);
  -- a case<->evidence / case<->clue relationship must point at a DIFFERENT case than the item's home case
  SELECT RAISE(ABORT, 'item already belongs to this case; link it to a different case')
   WHERE (NEW.b_type = 'evidence' AND NEW.a_type = 'case'
          AND (SELECT case_id FROM evidence WHERE id = NEW.b_id) = NEW.a_id)
      OR (NEW.b_type = 'clue' AND NEW.a_type = 'case'
          AND (SELECT case_id FROM clues WHERE id = NEW.b_id) = NEW.a_id);
END;

-- Remove dangling relationships when an endpoint record is deleted.
CREATE TRIGGER trg_rel_cleanup_case     AFTER DELETE ON cases     FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'case' AND a_id = OLD.id) OR (b_type = 'case' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_clue     AFTER DELETE ON clues     FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'clue' AND a_id = OLD.id) OR (b_type = 'clue' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_evidence AFTER DELETE ON evidence  FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'evidence' AND a_id = OLD.id) OR (b_type = 'evidence' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_location AFTER DELETE ON locations FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'location' AND a_id = OLD.id) OR (b_type = 'location' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_suspect  AFTER DELETE ON suspects  FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'suspect' AND a_id = OLD.id) OR (b_type = 'suspect' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_victim   AFTER DELETE ON victims   FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'victim' AND a_id = OLD.id) OR (b_type = 'victim' AND b_id = OLD.id); END;
CREATE TRIGGER trg_rel_cleanup_witness  AFTER DELETE ON witnesses FOR EACH ROW
BEGIN DELETE FROM relationships WHERE (a_type = 'witness' AND a_id = OLD.id) OR (b_type = 'witness' AND b_id = OLD.id); END;

-- ---------------------------------------------------------------------
-- 5. Views
-- ---------------------------------------------------------------------

-- Per-case rollup used by the board and list screens.
CREATE VIEW v_case_summary AS
SELECT c.id, c.case_number, c.title, c.description, c.crime_type, c.incident_date, c.location_id,
       c.priority, c.status, c.resolution, c.closed_at, c.is_archived, c.archived_at,
       c.created_by, c.created_at, c.updated_at,
       l.name AS location_name,
       (SELECT COUNT(*) FROM case_suspects  cs WHERE cs.case_id = c.id) AS suspect_count,
       (SELECT COUNT(*) FROM case_victims   cv WHERE cv.case_id = c.id) AS victim_count,
       (SELECT COUNT(*) FROM case_witnesses cw WHERE cw.case_id = c.id) AS witness_count,
       (SELECT COUNT(*) FROM evidence       e  WHERE e.case_id  = c.id) AS evidence_count,
       (SELECT COUNT(*) FROM clues          k  WHERE k.case_id  = c.id) AS clue_count,
       (SELECT u.full_name FROM case_investigators ci JOIN users u ON u.id = ci.user_id
         WHERE ci.case_id = c.id AND ci.role = 'lead') AS lead_investigator
FROM cases c
LEFT JOIN locations l ON l.id = c.location_id;

-- Unified, directed edge list of EVERYTHING that connects two records.
-- Each row says: "src --kind--> dst" and which table the fact is stored in.
-- The relationship engine (graph, neighbours, shortest path) is built on this view,
-- so the graph is always derived from real rows and never hard-coded.
CREATE VIEW v_graph_edges AS
  SELECT 'case' AS src_type, cs.case_id AS src_id, 'suspect' AS dst_type, cs.suspect_id AS dst_id,
         'suspect_in_case' AS kind, 'Suspect in case' AS label, cs.involvement_status AS detail,
         'case_suspects' AS source_table, NULL AS relationship_id, 'recorded' AS confidence
    FROM case_suspects cs
  UNION ALL
  SELECT 'case', cv.case_id, 'victim', cv.victim_id, 'victim_in_case', 'Victim in case', NULL, 'case_victims', NULL, 'recorded'
    FROM case_victims cv
  UNION ALL
  SELECT 'case', cw.case_id, 'witness', cw.witness_id, 'witness_in_case', 'Witness in case', cw.follow_up_status, 'case_witnesses', NULL, 'recorded'
    FROM case_witnesses cw
  UNION ALL
  SELECT 'case', e.case_id, 'evidence', e.id, 'evidence_of_case', 'Evidence of case', e.status, 'evidence', NULL, 'recorded'
    FROM evidence e
  UNION ALL
  SELECT 'case', k.case_id, 'clue', k.id, 'clue_of_case', 'Clue of case', k.status, 'clues', NULL, 'recorded'
    FROM clues k
  UNION ALL
  SELECT 'case', c.id, 'location', c.location_id, 'incident_location', 'Incident location', NULL, 'cases', NULL, 'recorded'
    FROM cases c WHERE c.location_id IS NOT NULL
  UNION ALL
  SELECT 'evidence', e.id, 'location', e.collected_location_id, 'collected_at', 'Collected at', NULL, 'evidence', NULL, 'recorded'
    FROM evidence e WHERE e.collected_location_id IS NOT NULL
  UNION ALL
  SELECT 'clue', k.id, 'location', k.location_id, 'discovered_at', 'Discovered at', NULL, 'clues', NULL, 'recorded'
    FROM clues k WHERE k.location_id IS NOT NULL
  UNION ALL
  SELECT r.a_type, r.a_id, r.b_type, r.b_id, r.relation_type, rt.label, r.description, 'relationships', r.id, r.confidence
    FROM relationships r JOIN relationship_types rt ON rt.code = r.relation_type;

-- Same edges in both directions: handy for traversals that ignore direction.
CREATE VIEW v_graph_edges_undirected AS
  SELECT src_type, src_id, dst_type, dst_id, kind, label, detail, source_table, relationship_id, confidence FROM v_graph_edges
  UNION ALL
  SELECT dst_type, dst_id, src_type, src_id, kind, label, detail, source_table, relationship_id, confidence FROM v_graph_edges;

-- Degree (number of connections) of every record, used to highlight hubs.
CREATE VIEW v_node_degree AS
  SELECT src_type AS entity_type, src_id AS entity_id, COUNT(*) AS degree
    FROM v_graph_edges_undirected
   GROUP BY src_type, src_id;

-- Chain-of-custody integrity report: should return zero rows when ledgers are consistent.
CREATE VIEW v_custody_violations AS
  SELECT e.id AS evidence_id, e.evidence_code, 'current custodian differs from last custody entry' AS problem
    FROM evidence e
   WHERE e.current_custodian_id IS NOT
         (SELECT to_custodian_id FROM custody_log WHERE evidence_id = e.id ORDER BY seq DESC LIMIT 1)
  UNION ALL
  SELECT e.id, e.evidence_code, 'no intake entry in the custody log'
    FROM evidence e
   WHERE NOT EXISTS (SELECT 1 FROM custody_log WHERE evidence_id = e.id AND seq = 1)
  UNION ALL
  SELECT l.evidence_id, e.evidence_code, 'gap in custody sequence numbers'
    FROM custody_log l JOIN evidence e ON e.id = l.evidence_id
   GROUP BY l.evidence_id
  HAVING MAX(l.seq) <> COUNT(*);

-- Investigator workload.
CREATE VIEW v_investigator_workload AS
SELECT u.id AS user_id, u.full_name, u.role, u.is_active,
       COUNT(CASE WHEN c.status <> 'closed' AND c.is_archived = 0 THEN 1 END) AS active_cases,
       COUNT(CASE WHEN c.status =  'closed' THEN 1 END)                       AS closed_cases,
       COUNT(CASE WHEN ci.role = 'lead' AND c.status <> 'closed' THEN 1 END)  AS leading
FROM users u
LEFT JOIN case_investigators ci ON ci.user_id = u.id
LEFT JOIN cases c ON c.id = ci.case_id
GROUP BY u.id;
