export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Your role does not allow this action.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (message: string, fields?: Record<string, string>) =>
  new AppError(422, 'VALIDATION_ERROR', message, fields ? { fields } : undefined);

interface SqliteLikeError extends Error {
  code?: string;
}

const COLUMN_NAMES: Record<string, string> = {
  'users.email': 'An account with this email already exists.',
  'users.username': 'This username is already taken.',
  'users.badge_number': 'This badge number is already in use.',
  'cases.case_number': 'A case with this number already exists.',
  'evidence.evidence_code': 'An evidence item with this code already exists.',
  'locations.name, locations.address': 'A location with this name and address already exists.',
};

/**
 * Translate a raw SQLite constraint failure into a precise, user-facing error.
 * Returns null for errors that are not constraint violations (those are real bugs -> 500).
 */
export function translateDbError(err: unknown): AppError | null {
  const e = err as SqliteLikeError;
  if (!e || typeof e.code !== 'string' || !e.code.startsWith('SQLITE_')) return null;
  const msg = e.message ?? '';

  switch (e.code) {
    case 'SQLITE_CONSTRAINT_UNIQUE':
    case 'SQLITE_CONSTRAINT_PRIMARYKEY': {
      if (msg.includes('uq_case_single_lead')) return conflict('This case already has a lead investigator.', 'DUPLICATE');
      if (msg.includes('relationships.')) return conflict('This relationship is already recorded.', 'DUPLICATE_RELATIONSHIP');
      if (msg.includes('case_suspects.') || msg.includes('case_victims.') || msg.includes('case_witnesses.'))
        return conflict('This record is already linked to the case.', 'DUPLICATE');
      if (msg.includes('case_investigators.')) return conflict('This investigator is already assigned to the case.', 'DUPLICATE');
      const cols = msg.replace(/^UNIQUE constraint failed:\s*/, '');
      return conflict(COLUMN_NAMES[cols] ?? COLUMN_NAMES[cols.split(',')[0]] ?? `A record with the same ${cols} already exists.`, 'DUPLICATE');
    }
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return conflict(
        'This record is still referenced by other records (or points at one that does not exist). Unlink or archive instead of deleting.',
        'REFERENCED',
      );
    case 'SQLITE_CONSTRAINT_TRIGGER':
      // RAISE(ABORT, '...') messages from our triggers are already written for people.
      return conflict(msg.charAt(0).toUpperCase() + msg.slice(1), 'RULE_VIOLATION');
    case 'SQLITE_CONSTRAINT_CHECK':
      return unprocessable(`A value is not allowed here (${msg.replace(/^CHECK constraint failed:\s*/, '').slice(0, 120)}).`);
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return unprocessable(`A required value is missing (${msg.replace(/^NOT NULL constraint failed:\s*/, '')}).`);
    case 'SQLITE_BUSY':
    case 'SQLITE_BUSY_SNAPSHOT':
      return new AppError(503, 'DATABASE_BUSY', 'The database is busy with another write. Try again in a moment.');
    default:
      if (e.code.startsWith('SQLITE_CONSTRAINT')) return conflict(msg, 'CONSTRAINT');
      return null;
  }
}
