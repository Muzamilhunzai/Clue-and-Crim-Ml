/** Single source of truth for every enumerated value. Mirrors the CHECK constraints in the database. */

export const ROLES = ['chief_investigator', 'investigator', 'evidence_officer'] as const;
export const CASE_STATUSES = ['open', 'investigating', 'suspect_identified', 'closed'] as const;
export const CASE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const CASE_RESOLUTIONS = ['solved', 'unsolved', 'unfounded', 'referred_to_court', 'withdrawn'] as const;
export const CRIME_TYPES = [
  'theft', 'burglary', 'fraud', 'cybercrime', 'assault', 'arson', 'vandalism',
  'smuggling', 'missing_person', 'forgery', 'hit_and_run', 'other',
] as const;
export const ASSIGNMENT_ROLES = ['lead', 'support'] as const;
export const INVOLVEMENT_STATUSES = ['person_of_interest', 'under_investigation', 'questioned', 'cleared', 'charged'] as const;
export const FOLLOW_UP_STATUSES = ['none_needed', 'pending', 'scheduled', 'completed'] as const;
export const GENDERS = ['male', 'female', 'other', 'unknown'] as const;
export const VICTIM_TYPES = ['individual', 'business', 'institution'] as const;
export const EVIDENCE_CATEGORIES = ['physical', 'digital', 'documentary', 'biological', 'trace', 'weapon', 'financial', 'other'] as const;
export const EVIDENCE_STATUSES = ['collected', 'in_storage', 'in_analysis', 'released', 'returned', 'disposed'] as const;
export const CONFIDENCE_LEVELS = ['unverified', 'low', 'medium', 'high'] as const;
export const CLUE_STATUSES = ['new', 'under_review', 'corroborated', 'discredited'] as const;
export const LOCATION_KINDS = ['residence', 'business', 'public_space', 'vehicle', 'online', 'government', 'other'] as const;
export const ENTITY_TYPES = ['case', 'clue', 'evidence', 'location', 'suspect', 'victim', 'witness'] as const;

export type Role = (typeof ROLES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];

const SPECIAL_LABELS: Record<string, string> = {
  chief_investigator: 'Chief Investigator',
  evidence_officer: 'Evidence Officer',
  investigator: 'Investigator',
  hit_and_run: 'Hit and run',
  person_of_interest: 'Person of interest',
  referred_to_court: 'Referred to court',
  none_needed: 'None needed',
  suspect_identified: 'Suspect identified',
  in_storage: 'In storage',
  in_analysis: 'In analysis',
  public_space: 'Public space',
  under_review: 'Under review',
  missing_person: 'Missing person',
};

export const humanize = (value: string): string =>
  SPECIAL_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

const opts = (values: readonly string[]) => values.map((value) => ({ value, label: humanize(value) }));

/** Option lists sent to the client (GET /api/meta) so forms and filters never hard-code values. */
export const META = {
  roles: opts(ROLES),
  caseStatuses: opts(CASE_STATUSES),
  casePriorities: opts(CASE_PRIORITIES),
  caseResolutions: opts(CASE_RESOLUTIONS),
  crimeTypes: opts(CRIME_TYPES),
  assignmentRoles: opts(ASSIGNMENT_ROLES),
  involvementStatuses: opts(INVOLVEMENT_STATUSES),
  followUpStatuses: opts(FOLLOW_UP_STATUSES),
  genders: opts(GENDERS),
  victimTypes: opts(VICTIM_TYPES),
  evidenceCategories: opts(EVIDENCE_CATEGORIES),
  evidenceStatuses: opts(EVIDENCE_STATUSES),
  confidenceLevels: opts(CONFIDENCE_LEVELS),
  clueStatuses: opts(CLUE_STATUSES),
  locationKinds: opts(LOCATION_KINDS),
  entityTypes: opts(ENTITY_TYPES),
};
