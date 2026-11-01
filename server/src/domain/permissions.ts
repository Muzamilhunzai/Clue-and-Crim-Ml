import type { Role } from './enums';

/**
 * Role-based access control matrix. Reading records is allowed to every signed-in
 * user (restricted FIELDS are masked per role, see services/masking.ts).
 * Everything that changes data needs one of the permissions below, enforced on
 * the server by requirePermission() and by the service layer.
 */
export type Permission =
  | 'case:create'
  | 'case:update'        // chiefs: any case; investigators: only cases they are assigned to
  | 'case:archive'
  | 'case:assign'
  | 'people:write'       // suspects, victims, witnesses
  | 'people:delete'
  | 'clue:write'
  | 'clue:delete'
  | 'location:write'
  | 'location:delete'
  | 'evidence:create'
  | 'evidence:update'
  | 'custody:transfer'
  | 'relationship:write'
  | 'sensitive:view'     // victim / suspect personal details and witness contacts
  | 'protected:view'     // contact details of protected witnesses
  | 'investigator:manage'
  | 'investigator:view_contact'
  | 'lab:use';

const ALL: Permission[] = [
  'case:create', 'case:update', 'case:archive', 'case:assign',
  'people:write', 'people:delete', 'clue:write', 'clue:delete',
  'location:write', 'location:delete',
  'evidence:create', 'evidence:update', 'custody:transfer',
  'relationship:write', 'sensitive:view', 'protected:view',
  'investigator:manage', 'investigator:view_contact', 'lab:use',
];

export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  chief_investigator: ALL,
  investigator: [
    'case:create', 'case:update',
    'people:write', 'clue:write', 'clue:delete',
    'location:write',
    'evidence:create',
    'relationship:write',
    'sensitive:view',
  ],
  evidence_officer: ['evidence:create', 'evidence:update', 'custody:transfer', 'location:write'],
};

export const roleCan = (role: Role, permission: Permission) => PERMISSIONS[role].includes(permission);
