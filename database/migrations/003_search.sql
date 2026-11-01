-- =====================================================================
-- Migration 003: full-text search (SQLite FTS5) kept in sync by triggers
--
-- Only non-restricted columns are indexed. Victim and witness contact
-- details (phone, e-mail, address) are deliberately NOT indexed so a
-- search can never reveal them to a role that may not see them.
-- =====================================================================
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  case_id     UNINDEXED,
  title,
  body,
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- ---- cases ----------------------------------------------------------
CREATE TRIGGER trg_fts_cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('case', NEW.id, NEW.id, NEW.title, NEW.case_number || ' ' || NEW.description || ' ' || NEW.crime_type);
END;
CREATE TRIGGER trg_fts_cases_au AFTER UPDATE OF title, description, case_number, crime_type ON cases BEGIN
  DELETE FROM search_index WHERE entity_type = 'case' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('case', NEW.id, NEW.id, NEW.title, NEW.case_number || ' ' || NEW.description || ' ' || NEW.crime_type);
END;
CREATE TRIGGER trg_fts_cases_ad AFTER DELETE ON cases BEGIN
  DELETE FROM search_index WHERE entity_type = 'case' AND entity_id = OLD.id;
END;

-- ---- suspects -------------------------------------------------------
CREATE TRIGGER trg_fts_suspects_ai AFTER INSERT ON suspects BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('suspect', NEW.id, NULL, NEW.full_name,
          NEW.suspect_code || ' ' || COALESCE(NEW.alias, '') || ' ' || COALESCE(NEW.occupation, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER trg_fts_suspects_au AFTER UPDATE OF full_name, alias, occupation, notes, suspect_code ON suspects BEGIN
  DELETE FROM search_index WHERE entity_type = 'suspect' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('suspect', NEW.id, NULL, NEW.full_name,
          NEW.suspect_code || ' ' || COALESCE(NEW.alias, '') || ' ' || COALESCE(NEW.occupation, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER trg_fts_suspects_ad AFTER DELETE ON suspects BEGIN
  DELETE FROM search_index WHERE entity_type = 'suspect' AND entity_id = OLD.id;
END;

-- ---- victims (name and code only) -----------------------------------
CREATE TRIGGER trg_fts_victims_ai AFTER INSERT ON victims BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('victim', NEW.id, NULL, NEW.full_name, NEW.victim_code || ' ' || NEW.victim_type);
END;
CREATE TRIGGER trg_fts_victims_au AFTER UPDATE OF full_name, victim_code, victim_type ON victims BEGIN
  DELETE FROM search_index WHERE entity_type = 'victim' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('victim', NEW.id, NULL, NEW.full_name, NEW.victim_code || ' ' || NEW.victim_type);
END;
CREATE TRIGGER trg_fts_victims_ad AFTER DELETE ON victims BEGIN
  DELETE FROM search_index WHERE entity_type = 'victim' AND entity_id = OLD.id;
END;

-- ---- witnesses (name, code, occupation) -----------------------------
CREATE TRIGGER trg_fts_witnesses_ai AFTER INSERT ON witnesses BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('witness', NEW.id, NULL, NEW.full_name, NEW.witness_code || ' ' || COALESCE(NEW.occupation, ''));
END;
CREATE TRIGGER trg_fts_witnesses_au AFTER UPDATE OF full_name, witness_code, occupation ON witnesses BEGIN
  DELETE FROM search_index WHERE entity_type = 'witness' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('witness', NEW.id, NULL, NEW.full_name, NEW.witness_code || ' ' || COALESCE(NEW.occupation, ''));
END;
CREATE TRIGGER trg_fts_witnesses_ad AFTER DELETE ON witnesses BEGIN
  DELETE FROM search_index WHERE entity_type = 'witness' AND entity_id = OLD.id;
END;

-- ---- evidence -------------------------------------------------------
CREATE TRIGGER trg_fts_evidence_ai AFTER INSERT ON evidence BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('evidence', NEW.id, NEW.case_id, NEW.title, NEW.evidence_code || ' ' || NEW.description || ' ' || NEW.category);
END;
CREATE TRIGGER trg_fts_evidence_au AFTER UPDATE OF title, description, evidence_code, category ON evidence BEGIN
  DELETE FROM search_index WHERE entity_type = 'evidence' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('evidence', NEW.id, NEW.case_id, NEW.title, NEW.evidence_code || ' ' || NEW.description || ' ' || NEW.category);
END;
CREATE TRIGGER trg_fts_evidence_ad AFTER DELETE ON evidence BEGIN
  DELETE FROM search_index WHERE entity_type = 'evidence' AND entity_id = OLD.id;
END;

-- ---- clues ----------------------------------------------------------
CREATE TRIGGER trg_fts_clues_ai AFTER INSERT ON clues BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('clue', NEW.id, NEW.case_id, NEW.title, NEW.clue_code || ' ' || NEW.description || ' ' || COALESCE(NEW.source, ''));
END;
CREATE TRIGGER trg_fts_clues_au AFTER UPDATE OF title, description, clue_code, source ON clues BEGIN
  DELETE FROM search_index WHERE entity_type = 'clue' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('clue', NEW.id, NEW.case_id, NEW.title, NEW.clue_code || ' ' || NEW.description || ' ' || COALESCE(NEW.source, ''));
END;
CREATE TRIGGER trg_fts_clues_ad AFTER DELETE ON clues BEGIN
  DELETE FROM search_index WHERE entity_type = 'clue' AND entity_id = OLD.id;
END;

-- ---- locations ------------------------------------------------------
CREATE TRIGGER trg_fts_locations_ai AFTER INSERT ON locations BEGIN
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('location', NEW.id, NULL, NEW.name, NEW.address || ' ' || NEW.city || ' ' || NEW.kind || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER trg_fts_locations_au AFTER UPDATE OF name, address, city, kind, notes ON locations BEGIN
  DELETE FROM search_index WHERE entity_type = 'location' AND entity_id = OLD.id;
  INSERT INTO search_index(entity_type, entity_id, case_id, title, body)
  VALUES ('location', NEW.id, NULL, NEW.name, NEW.address || ' ' || NEW.city || ' ' || NEW.kind || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER trg_fts_locations_ad AFTER DELETE ON locations BEGIN
  DELETE FROM search_index WHERE entity_type = 'location' AND entity_id = OLD.id;
END;
