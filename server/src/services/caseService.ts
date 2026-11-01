import { z } from 'zod';
import type { Db } from '../database/connection';
import { inTransaction } from '../database/connection';
import { CASE_PRIORITIES, CASE_RESOLUTIONS, CASE_STATUSES, CRIME_TYPES, FOLLOW_UP_STATUSES, INVOLVEMENT_STATUSES, humanize } from '../domain/enums';
import { roleCan } from '../domain/permissions';
import type { AuthUser } from '../domain/types';
import * as cases from '../repositories/caseRepository';
import type { LinkKind } from '../repositories/caseRepository';
import { audit } from '../repositories/auditRepository';
import { nextCaseNumber } from '../repositories/codeRepository';
import { findPublicById } from '../repositories/userRepository';
import { conflict, forbidden, notFound, unprocessable, AppError } from '../utils/errors';
import {
  isoDate, oneOf, optionalDate, optionalId, optionalText, parse, positiveInt, text, pageParams,
} from '../utils/validation';

// ---------------------------------------------------------------------------
// access control
// ---------------------------------------------------------------------------

/**
 * Case-scoped write access, enforced here (not in the UI):
 *  - chief investigators may change any case,
 *  - investigators only cases they are assigned to,
 *  - evidence officers never change case records.
 * Archived cases are read-only until unarchived.
 */
export function assertCaseWrite(db: Db, user: AuthUser, caseId: number, opts: { allowArchived?: boolean } = {}) {
  const flags = cases.caseFlags(db, caseId);
  if (!flags) throw notFound('Case');
  const allowed =
    user.role === 'chief_investigator' ||
    (user.role === 'investigator' && cases.isAssigned(db, caseId, user.id));
  if (!allowed) throw forbidden('You can only change cases you are assigned to.');
  if (flags.is_archived && !opts.allowArchived) {
    throw conflict('This case is archived and read-only. Ask the chief investigator to unarchive it first.', 'CASE_ARCHIVED');
  }
  return flags;
}

export const canWriteCase = (db: Db, user: AuthUser, caseId: number) =>
  user.role === 'chief_investigator' || (user.role === 'investigator' && cases.isAssigned(db, caseId, user.id));

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

const listQuery = pageParams.extend({
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  crime_type: z.enum(CRIME_TYPES).optional(),
  assignee: z.string().optional(),
  archived: z.enum(['exclude', 'only', 'include']).optional(),
});

const boardQuery = z.object({
  q: z.string().trim().max(100).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  crime_type: z.enum(CRIME_TYPES).optional(),
  assignee: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const assigneeId = (raw: string | undefined, user: AuthUser) => {
  if (!raw) return undefined;
  if (raw === 'me') return user.id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

function withInvestigators<T extends Record<string, unknown>>(db: Db, rows: T[]) {
  const map = cases.investigatorsFor(db, rows.map((r) => r.id as number));
  return rows.map((r) => ({ ...r, investigators: map.get(r.id as number) ?? [] }));
}

export function listCases(db: Db, user: AuthUser, query: unknown) {
  const q = parse(listQuery, query);
  const page = cases.listCases(db, { ...q, assignee: assigneeId(q.assignee, user) });
  return { ...page, items: withInvestigators(db, page.items) };
}

export function board(db: Db, user: AuthUser, query: unknown) {
  const q = parse(boardQuery, query);
  const rows = cases.boardCases(db, { ...q, assignee: assigneeId(q.assignee, user) });
  const withPeople = withInvestigators(db, rows);
  const columns = CASE_STATUSES.map((status) => {
    const items = withPeople.filter((r) => r.status === status);
    return { status, total: items.length ? (items[0].column_total as number) : 0, items };
  });
  return { columns };
}

export function getCaseDetail(db: Db, user: AuthUser, id: number) {
  const row = cases.getCaseRow(db, id);
  if (!row) throw notFound('Case');
  const canEdit = canWriteCase(db, user, id) && !row.is_archived;
  return {
    case: row,
    investigators: cases.investigatorsFor(db, [id]).get(id) ?? [],
    suspects: cases.linkedPeople.suspects(db, id),
    victims: cases.linkedPeople.victims(db, id),
    witnesses: cases.linkedPeople.witnesses(db, id),
    evidence: cases.caseEvidence(db, id),
    clues: cases.caseClues(db, id),
    notes: cases.caseNotes(db, id),
    activity: cases.caseActivity(db, id),
    permissions: {
      can_edit: canEdit,
      can_archive: roleCan(user.role, 'case:archive'),
      can_assign: roleCan(user.role, 'case:assign') && !row.is_archived,
      can_add_evidence:
        !row.is_archived && (user.role === 'chief_investigator' || user.role === 'evidence_officer' || canEdit),
    },
  };
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

const today = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // allow "tomorrow" for time-zone slack

const caseShape = {
  title: text(3, 160),
  description: z.string().trim().max(4000, 'Keep this under 4000 characters.').optional(),
  crime_type: oneOf(CRIME_TYPES, 'crime type'),
  incident_date: isoDate.refine((d) => d <= today(), 'The incident date cannot be in the future.'),
  location_id: optionalId,
  priority: oneOf(CASE_PRIORITIES, 'priority').optional(),
};

const createSchema = z.object({
  ...caseShape,
  lead_id: optionalId,
  support_ids: z.array(positiveInt).max(10).optional(),
});

const updateSchema = z.object({ ...z.object(caseShape).partial().shape, version: positiveInt });

const statusSchema = z
  .object({
    status: oneOf(CASE_STATUSES, 'status'),
    resolution: z.preprocess((v) => (v === '' ? null : v), z.enum(CASE_RESOLUTIONS).nullable().optional()),
    version: positiveInt.optional(),
  })
  .refine((v) => v.status !== 'closed' || !!v.resolution, {
    message: 'Choose how the case was resolved before closing it.',
    path: ['resolution'],
  });

function assertAssignable(db: Db, userId: number) {
  const u = findPublicById(db, userId);
  if (!u) throw unprocessable('Investigator not found.', { user_id: 'Investigator not found.' });
  if (!u.is_active) throw conflict(`${u.full_name} is deactivated and cannot be assigned.`, 'INACTIVE_USER');
  if (u.role === 'evidence_officer') throw conflict('Evidence officers cannot be assigned to lead or support a case.', 'ROLE_NOT_ASSIGNABLE');
  return u;
}

export function createCase(db: Db, user: AuthUser, body: unknown) {
  if (!roleCan(user.role, 'case:create')) throw forbidden('Your role cannot open cases.');
  const data = parse(createSchema, body);

  const isChief = user.role === 'chief_investigator';
  const leadId = data.lead_id ?? user.id;
  const support = [...new Set(data.support_ids ?? [])].filter((id) => id !== leadId);
  if (!isChief && (leadId !== user.id || support.length)) {
    throw forbidden('Only the chief investigator can assign other investigators when opening a case.');
  }

  const id = inTransaction(db, () => {
    assertAssignable(db, leadId);
    support.forEach((s) => assertAssignable(db, s));
    const case_number = nextCaseNumber(db);
    const caseId = cases.insertCase(db, {
      case_number,
      title: data.title,
      description: data.description ?? '',
      crime_type: data.crime_type,
      incident_date: data.incident_date,
      location_id: data.location_id ?? null,
      priority: data.priority ?? 'medium',
      created_by: user.id,
    });
    cases.upsertAssignment(db, caseId, leadId, 'lead', user.id);
    support.forEach((s) => cases.upsertAssignment(db, caseId, s, 'support', user.id));
    audit(db, user, { action: 'case.create', entityType: 'case', entityId: caseId, caseId, summary: `Opened case ${case_number}: ${data.title}` });
    return caseId;
  });
  return getCaseDetail(db, user, id);
}

function versionConflict(db: Db, user: AuthUser, id: number): never {
  const current = getCaseDetail(db, user, id);
  throw new AppError(
    409,
    'VERSION_CONFLICT',
    'Someone else changed this case after you opened it. Your edit was not saved. Review the latest version and apply your change again.',
    { current: current.case },
  );
}

export function updateCase(db: Db, user: AuthUser, id: number, body: unknown) {
  const { version, ...patch } = parse(updateSchema, body);
  const flags = assertCaseWrite(db, user, id);
  inTransaction(db, () => {
    const changed = cases.updateCase(db, id, version, {
      ...patch,
      ...(patch.description === undefined ? {} : { description: patch.description ?? '' }),
    });
    if (changed === 0) versionConflict(db, user, id);
    audit(db, user, {
      action: 'case.update', entityType: 'case', entityId: id, caseId: id,
      summary: `Updated case ${flags.case_number} (${Object.keys(patch).join(', ') || 'no fields'})`,
    });
  });
  return getCaseDetail(db, user, id);
}

export function changeStatus(db: Db, user: AuthUser, id: number, body: unknown) {
  const { status, resolution, version } = parse(statusSchema, body);
  const flags = assertCaseWrite(db, user, id);
  if (flags.status === status && status !== 'closed') return getCaseDetail(db, user, id);
  if (flags.status === 'closed' && status === 'closed') return getCaseDetail(db, user, id);

  inTransaction(db, () => {
    const changed = cases.setStatus(db, id, version, status, status === 'closed' ? resolution ?? null : null);
    if (changed === 0) versionConflict(db, user, id);
    const reopened = flags.status === 'closed' && status !== 'closed';
    audit(db, user, {
      action: 'case.status', entityType: 'case', entityId: id, caseId: id,
      summary: reopened
        ? `Reopened ${flags.case_number} as ${humanize(status).toLowerCase()}`
        : status === 'closed'
          ? `Closed ${flags.case_number} (${humanize(resolution ?? '').toLowerCase()})`
          : `Moved ${flags.case_number} from ${humanize(flags.status).toLowerCase()} to ${humanize(status).toLowerCase()}`,
    });
  });
  return getCaseDetail(db, user, id);
}

export function setArchived(db: Db, user: AuthUser, id: number, archived: boolean) {
  if (!roleCan(user.role, 'case:archive')) throw forbidden('Only the chief investigator can archive or restore cases.');
  const flags = cases.caseFlags(db, id);
  if (!flags) throw notFound('Case');
  if (archived && flags.status !== 'closed') throw conflict('Close the case before archiving it.', 'NOT_CLOSED');
  if (!!flags.is_archived === archived) return getCaseDetail(db, user, id);
  inTransaction(db, () => {
    cases.setArchived(db, id, archived);
    audit(db, user, {
      action: archived ? 'case.archive' : 'case.unarchive', entityType: 'case', entityId: id, caseId: id,
      summary: `${archived ? 'Archived' : 'Restored'} case ${flags.case_number}. No linked records were deleted.`,
    });
  });
  return getCaseDetail(db, user, id);
}

// ---- investigators ---------------------------------------------------------

const assignSchema = z.object({
  user_id: positiveInt,
  role: oneOf(['lead', 'support'] as const, 'role'),
});

export function assignInvestigator(db: Db, user: AuthUser, id: number, body: unknown) {
  if (!roleCan(user.role, 'case:assign')) throw forbidden('Only the chief investigator can assign investigators.');
  const { user_id, role } = parse(assignSchema, body);
  const flags = assertCaseWrite(db, user, id);
  inTransaction(db, () => {
    const target = assertAssignable(db, user_id);
    // the partial unique index allows one lead: demote the current lead first
    if (role === 'lead') cases.demoteLead(db, id);
    cases.upsertAssignment(db, id, user_id, role, user.id);
    audit(db, user, {
      action: 'case.assign', entityType: 'case', entityId: id, caseId: id,
      summary: `Assigned ${target.full_name} as ${role} on ${flags.case_number}`,
    });
  });
  return getCaseDetail(db, user, id);
}

export function removeInvestigator(db: Db, user: AuthUser, id: number, userId: number) {
  if (!roleCan(user.role, 'case:assign')) throw forbidden('Only the chief investigator can change assignments.');
  const flags = assertCaseWrite(db, user, id);
  const role = cases.assignmentRole(db, id, userId);
  if (!role) throw notFound('Assignment');
  if (role === 'lead') throw conflict('Make another investigator the lead before removing the current lead.', 'LEAD_REQUIRED');
  inTransaction(db, () => {
    cases.removeAssignment(db, id, userId);
    const who = findPublicById(db, userId)?.full_name ?? `user ${userId}`;
    audit(db, user, { action: 'case.unassign', entityType: 'case', entityId: id, caseId: id, summary: `Removed ${who} from ${flags.case_number}` });
  });
  return getCaseDetail(db, user, id);
}

// ---- notes -------------------------------------------------------------------

export function addNote(db: Db, user: AuthUser, id: number, body: unknown) {
  const { body: noteBody } = parse(z.object({ body: text(1, 2000) }), body);
  const flags = assertCaseWrite(db, user, id);
  inTransaction(db, () => {
    cases.insertNote(db, id, user.id, noteBody);
    audit(db, user, { action: 'case.note', entityType: 'case', entityId: id, caseId: id, summary: `Added a note to ${flags.case_number}` });
  });
  return cases.caseNotes(db, id);
}

// ---- linked people (suspects / victims / witnesses) -------------------------

const linkSchemas = {
  suspects: z.object({
    suspect_id: positiveInt,
    involvement_status: oneOf(INVOLVEMENT_STATUSES, 'involvement status').optional(),
    notes: optionalText(1000),
  }),
  victims: z.object({ victim_id: positiveInt, harm_summary: optionalText(500), notes: optionalText(1000) }),
  witnesses: z.object({
    witness_id: positiveInt,
    statement_summary: optionalText(2000),
    interview_date: optionalDate,
    follow_up_status: oneOf(FOLLOW_UP_STATUSES, 'follow-up status').optional(),
    notes: optionalText(1000),
  }),
} as const;

const FK_FIELD = { suspects: 'suspect_id', victims: 'victim_id', witnesses: 'witness_id' } as const;
const TABLES = { suspects: 'suspects', victims: 'victims', witnesses: 'witnesses' } as const;

export function linkPerson(db: Db, user: AuthUser, caseId: number, kind: LinkKind, body: unknown) {
  const parsed = parse(linkSchemas[kind] as z.ZodType<Record<string, unknown>>, body);
  const entityId = parsed[FK_FIELD[kind]] as number;
  const flags = assertCaseWrite(db, user, caseId);
  inTransaction(db, () => {
    const entity = db.prepare(`SELECT * FROM ${TABLES[kind]} WHERE id = ?`).get(entityId) as Record<string, unknown> | undefined;
    if (!entity) throw notFound(humanize(cases.LINKS[kind].entity));
    const { [FK_FIELD[kind]]: _omit, ...rest } = parsed;
    cases.insertLink(db, kind, caseId, entityId, rest, user.id);
    audit(db, user, {
      action: `case.link_${cases.LINKS[kind].entity}`, entityType: 'case', entityId: caseId, caseId,
      summary: `Linked ${cases.LINKS[kind].entity} ${entity.full_name} to ${flags.case_number}`,
    });
  });
  return getCaseDetail(db, user, caseId);
}

export function updatePersonLink(db: Db, user: AuthUser, caseId: number, kind: LinkKind, entityId: number, body: unknown) {
  const schema = (linkSchemas[kind] as z.ZodObject<z.ZodRawShape>).omit({ [FK_FIELD[kind]]: true } as never).partial();
  const data = parse(schema as z.ZodType<Record<string, unknown>>, body);
  const flags = assertCaseWrite(db, user, caseId);
  inTransaction(db, () => {
    if (cases.updateLink(db, kind, caseId, entityId, data) === 0 && !cases.linkedPeople[kind](db, caseId).some((r) => (r as { id: number }).id === entityId)) {
      throw notFound('Link');
    }
    audit(db, user, {
      action: `case.update_${cases.LINKS[kind].entity}_link`, entityType: 'case', entityId: caseId, caseId,
      summary: `Updated ${cases.LINKS[kind].entity} link on ${flags.case_number} (${Object.keys(data).join(', ')})`,
    });
  });
  return getCaseDetail(db, user, caseId);
}

export function unlinkPerson(db: Db, user: AuthUser, caseId: number, kind: LinkKind, entityId: number) {
  const flags = assertCaseWrite(db, user, caseId);
  inTransaction(db, () => {
    if (cases.deleteLink(db, kind, caseId, entityId) === 0) throw notFound('Link');
    audit(db, user, {
      action: `case.unlink_${cases.LINKS[kind].entity}`, entityType: 'case', entityId: caseId, caseId,
      summary: `Unlinked ${cases.LINKS[kind].entity} #${entityId} from ${flags.case_number}. The record itself is kept.`,
    });
  });
  return getCaseDetail(db, user, caseId);
}
