import type { AuthUser } from '../domain/types';
import type { PlainEntityType } from '../domain/entities';
import { roleCan } from '../domain/permissions';

/**
 * Field-level protection, applied on the server before any record leaves the API.
 * A masked field is returned as null and its name is listed in `restricted_fields`
 * so the UI can show a "restricted" marker instead of an empty value.
 */
const RESTRICTED: Partial<Record<PlainEntityType, string[]>> = {
  victim: ['phone', 'email', 'address', 'date_of_birth'],
  suspect: ['last_known_address', 'date_of_birth'],
  witness: ['phone', 'email', 'address'],
};

export function restrictedColumns(type: PlainEntityType): string[] {
  return RESTRICTED[type] ?? [];
}

/** True when `user` may see the restricted fields of this particular record. */
export function canSeeRestricted(user: AuthUser, type: PlainEntityType, row: Record<string, unknown>): boolean {
  if (!roleCan(user.role, 'sensitive:view')) return false;
  if (type === 'witness' && row.is_protected === 1 && !roleCan(user.role, 'protected:view')) return false;
  return true;
}

export function maskRow<T extends Record<string, unknown>>(user: AuthUser, type: PlainEntityType, row: T): T & { restricted_fields: string[] } {
  const cols = restrictedColumns(type);
  if (!cols.length || canSeeRestricted(user, type, row)) return { ...row, restricted_fields: [] };
  const out: Record<string, unknown> = { ...row };
  for (const c of cols) if (c in out) out[c] = null;
  // flag every restricted column so the UI shows a lock even when the stored value was empty
  return { ...(out as T), restricted_fields: cols.filter((c) => c in row) };
}
