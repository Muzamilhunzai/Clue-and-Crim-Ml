import type { Db } from '../database/connection';
import { inTransaction } from '../database/connection';
import { createSchemaOf, updateSchemaOf, type EntityDef } from '../domain/entities';
import { roleCan } from '../domain/permissions';
import type { AuthUser } from '../domain/types';
import { audit } from '../repositories/auditRepository';
import * as repo from '../repositories/entityRepository';
import { nextEvidenceCode, nextSimpleCode } from '../repositories/codeRepository';
import * as relRepo from '../repositories/relationshipRepository';
import { caseFlags, isAssigned } from '../repositories/caseRepository';
import * as custody from '../repositories/custodyRepository';
import { AppError, conflict, forbidden, notFound } from '../utils/errors';
import { pageParams, parse } from '../utils/validation';
import { canSeeRestricted, maskRow, restrictedColumns } from './masking';

// ---------------------------------------------------------------------------
// scope rules for case-bound records (clues, evidence)
// ---------------------------------------------------------------------------

function assertCaseScope(db: Db, user: AuthUser, def: EntityDef, caseId: number) {
  const flags = caseFlags(db, caseId);
  if (!flags) throw notFound('Case');
  if (flags.is_archived) throw conflict('This case is archived. Records cannot be added or changed until it is restored.', 'CASE_ARCHIVED');
  const assigned = user.role === 'investigator' && isAssigned(db, caseId, user.id);
  const ok =
    user.role === 'chief_investigator' ||
    (def.type === 'evidence' && user.role === 'evidence_officer') ||
    assigned;
  if (!ok) throw forbidden('You can only add or change records on cases you are assigned to.');
  return flags;
}

const needPermission = (user: AuthUser, permission: Parameters<typeof roleCan>[1]) => {
  if (!roleCan(user.role, permission)) throw forbidden();
};

const label = (def: EntityDef, row: Record<string, unknown>) =>
  `${def.codeColumn ? `${row[def.codeColumn]} ` : ''}${row[def.titleColumn]}`.trim();

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

export function list(db: Db, user: AuthUser, def: EntityDef, query: Record<string, unknown>) {
  const q = parse(pageParams, query);
  const filters = Object.fromEntries(
    Object.keys(def.filters).map((k) => [k, typeof query[k] === 'string' ? (query[k] as string) : undefined]),
  );
  const page = repo.list(db, def, {
    page: q.page, pageSize: q.pageSize, q: q.q, sort: q.sort, order: q.order, filters,
  });
  const counts = repo.connectionCounts(db, def.type, page.items.map((r) => r.id as number));
  return {
    ...page,
    items: page.items.map((r) => ({
      ...maskRow(user, def.type, r),
      ...(counts.get(r.id as number) ?? { connections: 0, linked_cases: 0 }),
    })),
  };
}

function linkedCases(db: Db, def: EntityDef, id: number) {
  const sql: Partial<Record<string, string>> = {
    suspect: `SELECT c.id, c.case_number, c.title, c.status, c.priority, x.involvement_status AS role_detail, x.notes, x.linked_at
                FROM case_suspects x JOIN cases c ON c.id = x.case_id WHERE x.suspect_id = ? ORDER BY c.created_at DESC`,
    victim: `SELECT c.id, c.case_number, c.title, c.status, c.priority, x.harm_summary AS role_detail, x.notes, x.linked_at
               FROM case_victims x JOIN cases c ON c.id = x.case_id WHERE x.victim_id = ? ORDER BY c.created_at DESC`,
    witness: `SELECT c.id, c.case_number, c.title, c.status, c.priority, x.follow_up_status AS role_detail,
                     x.statement_summary, x.interview_date, x.notes, x.linked_at
                FROM case_witnesses x JOIN cases c ON c.id = x.case_id WHERE x.witness_id = ? ORDER BY c.created_at DESC`,
    location: `SELECT c.id, c.case_number, c.title, c.status, c.priority, 'Incident location' AS role_detail, NULL AS notes, c.created_at AS linked_at
                 FROM cases c WHERE c.location_id = ? ORDER BY c.created_at DESC`,
  };
  const q = sql[def.type];
  return q ? db.prepare(q).all(id) : [];
}

export function get(db: Db, user: AuthUser, def: EntityDef, id: number) {
  const row = repo.getById(db, def, id);
  if (!row) throw notFound(def.singular.charAt(0).toUpperCase() + def.singular.slice(1));
  const record = maskRow(user, def.type, row);
  const extras: Record<string, unknown> = {
    cases: linkedCases(db, def, id),
    relationships: relRepo.neighbors(db, { type: def.type, id }),
  };
  if (def.type === 'evidence') {
    extras.custody = custody.chain(db, id);
    extras.custody_check = verifyCustody(db, id);
  }
  if (def.type === 'location') {
    extras.evidence = db.prepare(
      `SELECT id, evidence_code, title, status FROM evidence WHERE collected_location_id = ? ORDER BY collected_at DESC`,
    ).all(id);
    extras.clues = db.prepare(`SELECT id, clue_code, title, status FROM clues WHERE location_id = ? ORDER BY discovered_at DESC`).all(id);
  }
  const caseId = (row.case_id as number | undefined) ?? undefined;
  extras.permissions = {
    can_edit: canEdit(db, user, def, row),
    can_delete: def.deletable && !!def.deletePermission && roleCan(user.role, def.deletePermission) && canEdit(db, user, def, row),
    can_see_restricted: canSeeRestricted(user, def.type, row),
    can_transfer: def.type === 'evidence' && roleCan(user.role, 'custody:transfer'),
    case_id: caseId,
  };
  return { record, ...extras };
}

function canEdit(db: Db, user: AuthUser, def: EntityDef, row: Record<string, unknown>): boolean {
  if (!roleCan(user.role, def.updatePermission)) return false;
  if (def.type === 'clue' || def.type === 'evidence') {
    const flags = caseFlags(db, row.case_id as number);
    if (!flags || flags.is_archived) return false;
    if (user.role === 'chief_investigator') return true;
    if (def.type === 'evidence') return user.role === 'evidence_officer';
    return user.role === 'investigator' && isAssigned(db, row.case_id as number, user.id);
  }
  return true;
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

export function create(db: Db, user: AuthUser, def: EntityDef, body: unknown) {
  needPermission(user, def.writePermission);
  const data = parse(createSchemaOf(def), body) as Record<string, unknown>;

  const restricted = restrictedColumns(def.type).filter((c) => data[c] !== undefined && data[c] !== null);
  if (restricted.length && !roleCan(user.role, 'sensitive:view')) {
    throw forbidden('Your role cannot enter restricted personal details.');
  }
  if (def.type === 'witness' && data.is_protected === 1 && !roleCan(user.role, 'protected:view')) {
    throw forbidden('Only the chief investigator can register a protected witness.');
  }

  const id = inTransaction(db, () => {
    const row: Record<string, unknown> = { ...data };
    let caseId: number | null = null;
    if (def.type === 'clue' || def.type === 'evidence') caseId = assertCaseScope(db, user, def, data.case_id as number).id;

    if (def.type === 'evidence') {
      row.evidence_code = nextEvidenceCode(db);
      row.collected_by = user.id;
      row.current_custodian_id = user.id;
    } else if (def.codeColumn) {
      row[def.codeColumn] = nextSimpleCode(db, def.type as 'suspect' | 'victim' | 'witness' | 'clue');
    }
    if (def.createdByColumn) row[def.createdByColumn] = user.id;

    const newId = repo.insert(db, def, row);

    if (def.type === 'evidence') {
      // intake entry: the first link of the chain of custody
      custody.append(db, {
        evidence_id: newId, seq: 1, from: null, to: user.id, by: user.id,
        reason: 'Collected and logged', storage_location: (data.storage_location as string | null | undefined) ?? null,
      });
    }
    audit(db, user, {
      action: `${def.type}.create`, entityType: def.type, entityId: newId, caseId,
      summary: `Created ${def.singular} ${label(def, { ...row, id: newId })}`,
    });
    return newId;
  });
  return get(db, user, def, id);
}

export function update(db: Db, user: AuthUser, def: EntityDef, id: number, body: unknown) {
  needPermission(user, def.updatePermission);
  const patch = parse(updateSchemaOf(def), body) as Record<string, unknown>;
  const before = repo.getById(db, def, id);
  if (!before) throw notFound(def.singular.charAt(0).toUpperCase() + def.singular.slice(1));
  if (!canEdit(db, user, def, before)) {
    throw forbidden(def.type === 'clue' || def.type === 'evidence'
      ? 'You can only change records on cases you are assigned to (and the case must not be archived).'
      : undefined);
  }

  const touchesRestricted = restrictedColumns(def.type).some((c) => patch[c] !== undefined) ||
    (def.type === 'witness' && patch.is_protected !== undefined);
  if (touchesRestricted && !canSeeRestricted(user, def.type, before)) {
    throw forbidden('You are not permitted to view or change the restricted details of this record.');
  }

  inTransaction(db, () => {
    const changedKeys = Object.keys(patch).filter((k) => patch[k] !== undefined && String(patch[k] ?? '') !== String(before[k] ?? ''));
    if (!changedKeys.length) return;
    repo.update(db, def, id, Object.fromEntries(changedKeys.map((k) => [k, patch[k]])));
    audit(db, user, {
      action: `${def.type}.update`, entityType: def.type, entityId: id,
      caseId: (before.case_id as number | undefined) ?? null,
      summary: `Updated ${def.singular} ${label(def, before)} (${changedKeys.join(', ')})`,
    });
  });
  return get(db, user, def, id);
}

export function remove(db: Db, user: AuthUser, def: EntityDef, id: number) {
  if (!def.deletable || !def.deletePermission) {
    throw new AppError(
      405, 'NOT_DELETABLE',
      def.type === 'evidence'
        ? 'Evidence cannot be deleted because its chain of custody is a permanent record. Change its status to "disposed" instead.'
        : `${def.singular} records cannot be deleted.`,
    );
  }
  needPermission(user, def.deletePermission);
  const row = repo.getById(db, def, id);
  if (!row) throw notFound(def.singular.charAt(0).toUpperCase() + def.singular.slice(1));
  if (!canEdit(db, user, def, row)) throw forbidden('You can only delete records on cases you are assigned to.');

  const uses = ['case_count', 'evidence_count', 'clue_count'].reduce((n, k) => n + (Number(row[k]) || 0), 0);
  if (uses > 0) {
    throw conflict(
      `${label(def, row)} is still linked to ${uses} other record${uses === 1 ? '' : 's'}. Unlink it everywhere before deleting.`,
      'REFERENCED',
    );
  }
  inTransaction(db, () => {
    repo.remove(db, def, id);
    audit(db, user, {
      action: `${def.type}.delete`, entityType: def.type, entityId: id, caseId: (row.case_id as number | undefined) ?? null,
      summary: `Deleted ${def.singular} ${label(def, row)}`,
    });
  });
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// chain of custody
// ---------------------------------------------------------------------------

/**
 * Re-checks the chain from the rows themselves: contiguous sequence numbers, every entry's
 * previous custodian equals the previous entry's new custodian, and the evidence item's current
 * custodian equals the last entry. This is an application-level consistency check, NOT forensic proof:
 * anyone with file access to the SQLite database could still alter it.
 */
export function verifyCustody(db: Db, evidenceId: number) {
  const rows = custody.chain(db, evidenceId);
  const current = (db.prepare('SELECT current_custodian_id AS c FROM evidence WHERE id = ?').get(evidenceId) as { c: number } | undefined)?.c;
  const problems: string[] = [];
  rows.forEach((r, i) => {
    if (r.seq !== i + 1) problems.push(`Entry ${i + 1} has sequence number ${r.seq}.`);
    if (i === 0 && r.from_custodian_id !== null) problems.push('The first entry should be an intake with no previous custodian.');
    if (i > 0 && r.from_custodian_id !== rows[i - 1].to_custodian_id) problems.push(`Entry ${r.seq}: previous custodian does not match entry ${r.seq - 1}.`);
  });
  if (rows.length === 0) problems.push('No custody entries recorded.');
  else if (rows[rows.length - 1].to_custodian_id !== current) problems.push('Current custodian differs from the last custody entry.');
  custody.violationsFor(db, evidenceId).forEach((v) => problems.push(v.problem));
  return { ok: problems.length === 0, entries: rows.length, problems: [...new Set(problems)] };
}
