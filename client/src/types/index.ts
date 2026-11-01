/** Shapes returned by the TraceNet REST API (JSON is snake_case end to end). */

export type Role = 'chief_investigator' | 'investigator' | 'evidence_officer';
export type CaseStatus = 'open' | 'investigating' | 'suspect_identified' | 'closed';
export type EntityType = 'case' | 'suspect' | 'victim' | 'witness' | 'evidence' | 'clue' | 'location';
export type Permission =
  | 'case:create' | 'case:update' | 'case:archive' | 'case:assign' | 'people:write' | 'people:delete'
  | 'clue:write' | 'clue:delete' | 'location:write' | 'location:delete' | 'evidence:create' | 'evidence:update'
  | 'custody:transfer' | 'relationship:write' | 'sensitive:view' | 'protected:view'
  | 'investigator:manage' | 'investigator:view_contact' | 'lab:use';

export interface User {
  id: number; username: string; full_name: string; email: string; role: Role; badge_number: string;
  department: string | null; phone: string | null; is_active: number; last_login_at: string | null;
}
export interface Session { user: User; permissions: Permission[] }

export interface Option { value: string; label: string }
export interface Meta {
  roles: Option[]; caseStatuses: Option[]; casePriorities: Option[]; caseResolutions: Option[]; crimeTypes: Option[];
  assignmentRoles: Option[]; involvementStatuses: Option[]; followUpStatuses: Option[]; genders: Option[];
  victimTypes: Option[]; evidenceCategories: Option[]; evidenceStatuses: Option[]; confidenceLevels: Option[];
  clueStatuses: Option[]; locationKinds: Option[]; entityTypes: Option[]; permissions: Permission[];
}
export interface Lookups {
  users: { id: number; full_name: string; role: Role }[];
  cases: { id: number; case_number: string; title: string; status: CaseStatus; is_archived: number }[];
  locations: { id: number; name: string; address: string; kind: string }[];
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export interface Assignee { id: number; full_name: string; role: Role; assignment_role: 'lead' | 'support' }

export interface CaseRow {
  id: number; case_number: string; title: string; description: string | null; crime_type: string;
  incident_date: string; location_id: number | null; location_name: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical'; status: CaseStatus; resolution: string | null;
  closed_at: string | null; is_archived: number; archived_at: string | null;
  created_at: string; updated_at: string; version: number;
  suspect_count: number; victim_count: number; witness_count: number; evidence_count: number; clue_count: number;
  lead_investigator: string | null; investigators: Assignee[];
  location_address?: string | null; location_kind?: string | null; location_city?: string | null; created_by_name?: string | null;
}

export interface Board { columns: { status: CaseStatus; total: number; items: CaseRow[] }[] }

export interface ActivityRow {
  id: number; action: string; entity_type: string; entity_id: number | null; case_id?: number | null;
  summary: string; created_at: string; user_name: string | null; user_id?: number | null; case_number?: string | null;
}

export interface PersonLink {
  id: number; code: string; full_name: string; case_count: number; linked_at?: string; notes?: string | null;
  alias?: string | null; occupation?: string | null; involvement_status?: string;
  victim_type?: string; harm_summary?: string | null;
  is_protected?: number; follow_up_status?: string; statement_summary?: string | null; interview_date?: string | null;
}

export interface CaseDetail {
  case: CaseRow;
  investigators: Assignee[];
  suspects: PersonLink[]; victims: PersonLink[]; witnesses: PersonLink[];
  evidence: { id: number; evidence_code: string; title: string; category: string; status: string; collected_at: string; custodian_name: string }[];
  clues: { id: number; clue_code: string; title: string; confidence: string; status: string; discovered_at: string; source: string | null }[];
  notes: { id: number; body: string; created_at: string; author: string }[];
  activity: ActivityRow[];
  permissions: { can_edit: boolean; can_archive: boolean; can_assign: boolean; can_add_evidence: boolean };
}

export interface Dashboard {
  totals: { total: number; active: number; closed: number; archived: number; solved: number; critical: number; clearance_rate: number };
  byStatus: { status: string; n: number }[];
  byPriority: { priority: string; n: number }[];
  byCrimeType: { crime_type: string; n: number }[];
  evidence: { total: number; in_custody: number; in_analysis: number; cases: number };
  counts: { suspects: number; victims: number; witnesses: number; clues: number; relationships: number };
  mine: number;
  weekly: { date: string; weekday: number; cases: number; evidence: number; clues: number; total: number; previous_date: string; previous_total: number }[];
  trend: Record<'cases' | 'evidence' | 'clues', { current: number; previous: number }>;
  recentActivity: ActivityRow[];
  hubs: HotNode[];
  integrity: { custody_problems: number };
}

export interface HotNode { type: EntityType; id: number; code: string; label: string; subtitle: string; case_count?: number; degree: number }

/** Generic plain record (suspect, victim, witness, location, clue, evidence). */
export type EntityRecord = Record<string, unknown> & { id: number; restricted_fields?: string[]; connections?: number; linked_cases?: number };

export interface CustodyEntry {
  id: number; seq: number; from_custodian_id: number | null; from_name: string | null; to_custodian_id: number; to_name: string;
  transferred_by: number; transferred_by_name: string; reason: string; storage_location: string | null; transferred_at: string;
}

export interface GraphNode {
  key: string; type: EntityType; id: number; code: string; label: string; subtitle: string; status: string | null;
  home_case_id: number | null; degree: number; case_count: number; depth: number;
}
export interface GraphEdge {
  id: string; source: string; target: string; kind: string; label: string; detail: string | null; table: string;
  confidence: string; removable: boolean; relationship_id: number | null; description: string | null; citation: string | null;
  recorded_on: string | null; created_by_name: string | null;
}
export interface GraphData {
  focus: string; depth: number; requested_depth: number; truncated: boolean;
  nodes: GraphNode[]; edges: GraphEdge[]; counts: Record<string, number>;
}
export interface NodeDetail { node: GraphNode; links: { edge: GraphEdge; other: GraphNode }[]; counts_by_type: Record<string, number> }
export interface RelRules {
  types: { code: string; label: string; description: string }[];
  pairs: { a_type: EntityType; b_type: EntityType; relation_type: string }[];
  structural: { a_type: string; b_type: string; relation_type: string; label: string }[];
}
export interface LookupItem { type: EntityType; id: number; code: string; label: string; subtitle: string }
export interface Hotspots { multiCase: HotNode[]; topConnected: HotNode[]; topCases: { id: number; code: string; label: string; status: string; degree: number }[] }
export interface PathResult { found: boolean; hops?: number; nodes: GraphNode[]; edges: GraphEdge[] }

export interface Investigator {
  id: number; username: string | null; full_name: string; email: string | null; role: Role; badge_number: string | null;
  department: string | null; phone: string | null; is_active: number; last_login_at: string | null; created_at: string;
  active_cases: number; closed_cases: number; leading: number;
}

export interface SearchHit {
  type: EntityType; id: number; case_id: number | null; code: string; label: string; subtitle: string;
  title_highlight: string; snippet: string;
}

export interface LabStep { label: string; sql?: string; status: 'ok' | 'rejected' | 'info' | 'warn' | 'unexpected'; message: string; rows?: unknown[] }
export interface LabDemoMeta { id: string; title: string; concept: string; blurb: string }
export interface LabDemoResult { id: string; title: string; concept: string; steps: LabStep[]; takeaway: string; persisted: false }
