import { z } from 'zod';
import type { Db } from '../database/connection';
import { inTransaction } from '../database/connection';
import { EVIDENCE_STATUSES, humanize } from '../domain/enums';
import { roleCan } from '../domain/permissions';
import type { AuthUser } from '../domain/types';
import { audit } from '../repositories/auditRepository';
import * as custody from '../repositories/custodyRepository';
import { findPublicById } from '../repositories/userRepository';
import { conflict, forbidden, notFound, unprocessable } from '../utils/errors';
import { oneOf, optionalText, parse, positiveInt, text } from '../utils/validation';
import { ENTITIES } from '../domain/entities';
import * as entityService from './entityService';

const transferSchema = z.object({
  to_custodian_id: positiveInt,
  reason: text(3, 300),
  storage_location: optionalText(120),
  status: oneOf(EVIDENCE_STATUSES, 'status').optional(),
});

/**
 * Transfer custody of an evidence item. ONE transaction does all of:
 *   1. append a row to custody_log (append-only: the database rejects UPDATE/DELETE),
 *   2. move evidence.current_custodian_id (and optionally status / storage location),
 *   3. write the audit trail.
 * If any step fails nothing is saved, so the ledger and the evidence row cannot disagree.
 */
export function transfer(db: Db, user: AuthUser, evidenceId: number, body: unknown) {
  if (!roleCan(user.role, 'custody:transfer')) throw forbidden('Only evidence officers and the chief investigator can record custody transfers.');
  const data = parse(transferSchema, body);

  inTransaction(db, () => {
    const ev = db
      .prepare('SELECT id, evidence_code, status, current_custodian_id, case_id FROM evidence WHERE id = ?')
      .get(evidenceId) as { id: number; evidence_code: string; status: string; current_custodian_id: number; case_id: number } | undefined;
    if (!ev) throw notFound('Evidence item');
    if (ev.status === 'disposed') throw conflict('Disposed evidence cannot be transferred.', 'DISPOSED');
    if (data.to_custodian_id === ev.current_custodian_id) {
      throw unprocessable('Choose a different custodian: the item is already with them.', { to_custodian_id: 'The item is already with this person.' });
    }
    const to = findPublicById(db, data.to_custodian_id);
    if (!to) throw unprocessable('Custodian not found.', { to_custodian_id: 'Custodian not found.' });
    if (!to.is_active) throw conflict(`${to.full_name} is deactivated and cannot hold evidence.`, 'INACTIVE_USER');

    const last = custody.lastEntry(db, evidenceId);
    custody.append(db, {
      evidence_id: evidenceId,
      seq: (last?.seq ?? 0) + 1,
      from: ev.current_custodian_id,
      to: data.to_custodian_id,
      by: user.id,
      reason: data.reason,
      storage_location: data.storage_location ?? null,
    });

    const sets = ['current_custodian_id = @to'];
    const params: Record<string, unknown> = { id: evidenceId, to: data.to_custodian_id };
    if (data.storage_location !== undefined) { sets.push('storage_location = @loc'); params.loc = data.storage_location; }
    if (data.status !== undefined) { sets.push('status = @status'); params.status = data.status; }
    db.prepare(`UPDATE evidence SET ${sets.join(', ')} WHERE id = @id`).run(params);

    audit(db, user, {
      action: 'custody.transfer', entityType: 'evidence', entityId: evidenceId, caseId: ev.case_id,
      summary: `Custody of ${ev.evidence_code} moved to ${to.full_name}${data.status ? ` (${humanize(data.status).toLowerCase()})` : ''}`,
    });
  });

  return entityService.get(db, user, ENTITIES.evidence, evidenceId);
}

export function chain(db: Db, evidenceId: number) {
  if (!db.prepare('SELECT 1 FROM evidence WHERE id = ?').get(evidenceId)) throw notFound('Evidence item');
  return { entries: custody.chain(db, evidenceId), check: entityService.verifyCustody(db, evidenceId) };
}
