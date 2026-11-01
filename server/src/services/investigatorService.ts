import { z } from 'zod';
import type { Db } from '../database/connection';
import { inTransaction } from '../database/connection';
import { ROLES } from '../domain/enums';
import { roleCan } from '../domain/permissions';
import type { AuthUser } from '../domain/types';
import { audit } from '../repositories/auditRepository';
import * as users from '../repositories/userRepository';
import * as sessions from '../repositories/sessionRepository';
import { conflict, forbidden, notFound } from '../utils/errors';
import { oneOf, optionalText, parse, passwordSchema, text } from '../utils/validation';
import { hashPassword } from './authService';

const CONTACT_FIELDS = ['email', 'phone', 'badge_number', 'username', 'last_login_at'] as const;

/** Everyone sees names, roles and workloads; contact and credentials-adjacent fields need investigator:view_contact. */
function present(user: AuthUser, row: Record<string, unknown>) {
  if (roleCan(user.role, 'investigator:view_contact') || row.id === user.id) return row;
  const copy = { ...row };
  for (const f of CONTACT_FIELDS) copy[f] = null;
  return copy;
}

export const list = (db: Db, user: AuthUser) => users.listWithWorkload(db).map((r) => present(user, r));

export const options = (db: Db) => users.activeUsersBrief(db);

export function get(db: Db, user: AuthUser, id: number) {
  const row = users.listWithWorkload(db).find((r) => r.id === id);
  if (!row) throw notFound('Investigator');
  return { investigator: present(user, row), cases: users.assignedCases(db, id) };
}

const createSchema = z.object({
  username: z.string().trim().min(3, 'Use at least 3 characters.').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores.'),
  full_name: text(2, 100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(120),
  role: oneOf(ROLES, 'role'),
  badge_number: text(2, 20),
  department: optionalText(80),
  phone: optionalText(40),
  password: passwordSchema,
});

export async function create(db: Db, user: AuthUser, body: unknown) {
  if (!roleCan(user.role, 'investigator:manage')) throw forbidden('Only the chief investigator can add investigators.');
  const { password, ...data } = parse(createSchema, body);
  const hash = await hashPassword(password);
  const id = inTransaction(db, () => {
    const newId = users.insertUser(db, { ...data, department: data.department ?? null, phone: data.phone ?? null, password_hash: hash });
    audit(db, user, { action: 'user.create', entityType: 'user', entityId: newId, summary: `Added ${data.full_name} as ${data.role.replace('_', ' ')}` });
    return newId;
  });
  return get(db, user, id);
}

const updateSchema = z.object({
  full_name: text(2, 100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(120),
  role: oneOf(ROLES, 'role'),
  badge_number: text(2, 20),
  department: optionalText(80),
  phone: optionalText(40),
  is_active: z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0)),
}).partial();

export function update(db: Db, user: AuthUser, id: number, body: unknown) {
  if (!roleCan(user.role, 'investigator:manage')) throw forbidden('Only the chief investigator can edit investigators.');
  const patch = parse(updateSchema, body);
  const target = users.findById(db, id);
  if (!target) throw notFound('Investigator');

  const losingChief =
    target.role === 'chief_investigator' &&
    ((patch.role !== undefined && patch.role !== 'chief_investigator') || patch.is_active === 0);
  if (id === user.id && (patch.is_active === 0 || (patch.role !== undefined && patch.role !== user.role))) {
    throw conflict('You cannot deactivate your own account or change your own role.', 'SELF_CHANGE');
  }
  if (losingChief && users.countActiveChiefs(db) <= 1) {
    throw conflict('There must always be at least one active chief investigator.', 'LAST_CHIEF');
  }

  inTransaction(db, () => {
    users.updateUser(db, id, patch);
    if (patch.is_active === 0) sessions.deleteForUser(db, id); // deactivation signs the person out everywhere
    audit(db, user, {
      action: 'user.update', entityType: 'user', entityId: id,
      summary: `Updated investigator ${target.full_name} (${Object.keys(patch).join(', ')})`,
    });
  });
  return get(db, user, id);
}

export async function resetPassword(db: Db, user: AuthUser, id: number, body: unknown) {
  if (!roleCan(user.role, 'investigator:manage')) throw forbidden('Only the chief investigator can reset passwords.');
  const { password } = parse(z.object({ password: passwordSchema }), body);
  const target = users.findById(db, id);
  if (!target) throw notFound('Investigator');
  const hash = await hashPassword(password);
  inTransaction(db, () => {
    users.setPasswordHash(db, id, hash);
    sessions.deleteForUser(db, id);
    audit(db, user, { action: 'user.password_reset', entityType: 'user', entityId: id, summary: `Reset the password of ${target.full_name}` });
  });
  return { reset: true };
}
