import { z, type ZodType } from 'zod';
import { unprocessable } from './errors';

/** Parse request data with a zod schema; throw a 422 with per-field messages on failure. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = friendlyMessage(issue.message, issue.code);
  }
  const first = Object.entries(fields)[0];
  throw unprocessable(first ? `${first[0] === '_' ? '' : first[0] + ': '}${first[1]}` : 'Invalid input.', fields);
}

function friendlyMessage(message: string, code: string): string {
  if (code === 'invalid_type' && /received undefined|expected .* received/i.test(message)) return 'This field is required.';
  if (code === 'invalid_type') return 'This field is required.';
  return message;
}

// ---- reusable field schemas ------------------------------------------------

export const text = (min = 1, max = 200) =>
  z.string({ error: 'This field is required.' }).trim().min(min, min === 1 ? 'This field is required.' : `Enter at least ${min} characters.`).max(max, `Keep this under ${max} characters.`);

/** Optional free text. Empty string and null both become null ("no value"). */
export const optionalText = (max = 2000) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, `Keep this under ${max} characters.`).nullable().optional(),
  );

export const isoDate = z.iso.date({ error: 'Use a valid date (YYYY-MM-DD).' });

export const optionalDate = z.preprocess(
  (v) => (v === '' ? null : v),
  z.iso.date({ error: 'Use a valid date (YYYY-MM-DD).' }).nullable().optional(),
);

export const positiveInt = z.coerce.number().int().positive();

export const optionalId = z.preprocess(
  (v) => (v === '' || v === undefined ? (v === '' ? null : undefined) : v),
  z.coerce.number().int().positive().nullable().optional(),
);

export const oneOf = <T extends readonly [string, ...string[]]>(values: T, label = 'value') =>
  z.enum(values, { error: `Choose a valid ${label}.` });

export const idParam = (raw: unknown, what = 'id'): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw unprocessable(`Invalid ${what}.`);
  return n;
};

export const pageParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const passwordSchema = z
  .string({ error: 'This field is required.' })
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use at most 128 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.');

/** Escape LIKE wildcards in a user-supplied search term. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
