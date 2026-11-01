import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { fmtDate, humanize } from '@/lib/format';
import { labelOf } from '@/hooks/useData';
import type { EntityRecord, EntityType, Meta } from '@/types';
import { Badge, statusTone } from '@/components/ui/primitives';

export type PlainType = Exclude<EntityType, 'case'>;
export type OptKey = 'genders' | 'victimTypes' | 'evidenceCategories' | 'evidenceStatuses' | 'confidenceLevels' | 'clueStatuses' | 'locationKinds' | 'involvementStatuses' | 'followUpStatuses';

export interface FieldSpec {
  name: string; label: string; kind: 'text' | 'textarea' | 'date' | 'select' | 'number' | 'checkbox' | 'case' | 'location';
  options?: OptKey; required?: boolean; restricted?: boolean; createOnly?: boolean; editOnly?: boolean; wide?: boolean; hint?: string; placeholder?: string;
  /** shown in the detail view (defaults to true) */ detail?: boolean;
}
export interface ColumnDef { key: string; header: string; sort?: string; cell: (r: Rec, meta?: Meta) => ReactNode; className?: string; firstOrder?: 'asc' | 'desc' }
export interface FilterDef { param: string; label: string; source: OptKey | 'cases' | 'yesno' }
export type Rec = EntityRecord & Record<string, unknown>;

export interface EntityConfig {
  type: PlainType; plural: string; singular: string; apiPath: string; title: string; blurb: string;
  fields: FieldSpec[]; columns: ColumnDef[]; filters: FilterDef[]; defaultSort: string; defaultOrder: 'asc' | 'desc';
  searchHint: string; titleField: string; codeField?: string;
}

const str = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
const dash = (v: unknown): ReactNode => (str(v) ? str(v) : <span className="text-faint">-</span>);
const link = (type: string, r: Rec, text: string) => <Link to={`/${type}/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{text}</Link>;
const caseLink = (r: Rec) => <Link to={`/cases/${r.case_id}`} className="tabular hover:underline" title={String(r.case_title ?? '')} onClick={(e) => e.stopPropagation()}>{String(r.case_number)}</Link>;
const code = (r: Rec, k: string) => <span className="tabular text-[12.5px] text-muted">{str(r[k])}</span>;
const counts = (r: Rec): ReactNode => <span className="tabular">{Number(r.case_count ?? r.linked_cases ?? 0)}</span>;
const conn = (r: Rec): ReactNode => <span className="tabular text-muted">{Number(r.connections ?? 0)}</span>;
const optLabel = (key: keyof Meta) => (r: Rec, meta?: Meta, f = '') => labelOf(meta?.[key] as { value: string; label: string }[] | undefined, str(r[f]));

export const ENTITY_CONFIG: Record<PlainType, EntityConfig> = {
  suspect: {
    type: 'suspect', plural: 'Suspects', singular: 'Suspect', apiPath: 'suspects', title: 'Suspects', titleField: 'full_name', codeField: 'suspect_code', defaultSort: 'name', defaultOrder: 'asc',
    blurb: 'People under consideration in one or more cases. Being listed here is not a finding of guilt.', searchHint: 'Search by name, alias, code or occupation',
    fields: [
      { name: 'full_name', label: 'Full name', kind: 'text', required: true, wide: true },
      { name: 'alias', label: 'Alias', kind: 'text' },
      { name: 'gender', label: 'Gender', kind: 'select', options: 'genders' },
      { name: 'date_of_birth', label: 'Date of birth', kind: 'date', restricted: true },
      { name: 'occupation', label: 'Occupation', kind: 'text' },
      { name: 'last_known_address', label: 'Last known address', kind: 'text', restricted: true, wide: true },
      { name: 'physical_description', label: 'Physical description', kind: 'textarea', wide: true },
      { name: 'notes', label: 'Notes', kind: 'textarea', wide: true },
    ],
    columns: [
      { key: 'code', header: 'Code', sort: 'code', cell: (r) => code(r, 'suspect_code') },
      { key: 'name', header: 'Name', sort: 'name', cell: (r) => <div>{link('suspects', r, str(r.full_name))}{str(r.alias) && <p className="text-[12px] text-muted">aka “{str(r.alias)}”</p>}</div> },
      { key: 'gender', header: 'Gender', cell: (r, m) => dash(optLabel('genders')(r, m, 'gender')) },
      { key: 'occ', header: 'Occupation', cell: (r) => dash(r.occupation) },
      { key: 'cases', header: 'Cases', sort: 'cases', firstOrder: 'desc', cell: counts },
      { key: 'conn', header: 'Links', cell: conn },
    ],
    filters: [{ param: 'gender', label: 'Gender', source: 'genders' }, { param: 'involvement_status', label: 'Involvement', source: 'involvementStatuses' }, { param: 'case_id', label: 'Case', source: 'cases' }],
  },
  victim: {
    type: 'victim', plural: 'Victims', singular: 'Victim', apiPath: 'victims', title: 'Victims', titleField: 'full_name', codeField: 'victim_code', defaultSort: 'name', defaultOrder: 'asc',
    blurb: 'People, businesses and institutions harmed in a case. Contact details are restricted by role.', searchHint: 'Search by name or code',
    fields: [
      { name: 'full_name', label: 'Name', kind: 'text', required: true, wide: true },
      { name: 'victim_type', label: 'Type', kind: 'select', options: 'victimTypes' },
      { name: 'date_of_birth', label: 'Date of birth', kind: 'date', restricted: true },
      { name: 'phone', label: 'Phone', kind: 'text', restricted: true },
      { name: 'email', label: 'Email', kind: 'text', restricted: true },
      { name: 'address', label: 'Address', kind: 'text', restricted: true, wide: true },
      { name: 'notes', label: 'Notes', kind: 'textarea', wide: true },
    ],
    columns: [
      { key: 'code', header: 'Code', sort: 'code', cell: (r) => code(r, 'victim_code') },
      { key: 'name', header: 'Name', sort: 'name', cell: (r) => link('victims', r, str(r.full_name)) },
      { key: 'type', header: 'Type', cell: (r, m) => dash(optLabel('victimTypes')(r, m, 'victim_type')) },
      { key: 'cases', header: 'Cases', sort: 'cases', firstOrder: 'desc', cell: counts },
      { key: 'conn', header: 'Links', cell: conn },
    ],
    filters: [{ param: 'victim_type', label: 'Type', source: 'victimTypes' }, { param: 'case_id', label: 'Case', source: 'cases' }],
  },
  witness: {
    type: 'witness', plural: 'Witnesses', singular: 'Witness', apiPath: 'witnesses', title: 'Witnesses', titleField: 'full_name', codeField: 'witness_code', defaultSort: 'name', defaultOrder: 'asc',
    blurb: 'People who saw or know something relevant. Protected witnesses have contact details visible to the chief investigator only.', searchHint: 'Search by name, code or occupation',
    fields: [
      { name: 'full_name', label: 'Full name', kind: 'text', required: true, wide: true },
      { name: 'occupation', label: 'Occupation', kind: 'text' },
      { name: 'is_protected', label: 'Protected witness', kind: 'checkbox', restricted: true, hint: 'Hides contact details from everyone except the chief investigator.' },
      { name: 'phone', label: 'Phone', kind: 'text', restricted: true },
      { name: 'email', label: 'Email', kind: 'text', restricted: true },
      { name: 'address', label: 'Address', kind: 'text', restricted: true, wide: true },
      { name: 'notes', label: 'Notes', kind: 'textarea', wide: true },
    ],
    columns: [
      { key: 'code', header: 'Code', sort: 'code', cell: (r) => code(r, 'witness_code') },
      { key: 'name', header: 'Name', sort: 'name', cell: (r) => <div className="flex items-center gap-2">{link('witnesses', r, str(r.full_name))}{r.is_protected === 1 && <Badge tone="ink" dot={false}><Lock size={10} />Protected</Badge>}</div> },
      { key: 'occ', header: 'Occupation', cell: (r) => dash(r.occupation) },
      { key: 'cases', header: 'Cases', sort: 'cases', firstOrder: 'desc', cell: counts },
      { key: 'conn', header: 'Links', cell: conn },
    ],
    filters: [{ param: 'is_protected', label: 'Protection', source: 'yesno' }, { param: 'follow_up_status', label: 'Follow-up', source: 'followUpStatuses' }, { param: 'case_id', label: 'Case', source: 'cases' }],
  },
  location: {
    type: 'location', plural: 'Locations', singular: 'Location', apiPath: 'locations', title: 'Locations', titleField: 'name', defaultSort: 'name', defaultOrder: 'asc',
    blurb: 'Places where incidents happened, evidence was found or clues were noticed.', searchHint: 'Search by name, address or city',
    fields: [
      { name: 'name', label: 'Name', kind: 'text', required: true, wide: true },
      { name: 'address', label: 'Address', kind: 'text', required: true, wide: true },
      { name: 'city', label: 'City', kind: 'text' },
      { name: 'kind', label: 'Kind', kind: 'select', options: 'locationKinds' },
      { name: 'latitude', label: 'Latitude', kind: 'number', hint: '-90 to 90', placeholder: '33.6844' },
      { name: 'longitude', label: 'Longitude', kind: 'number', hint: '-180 to 180', placeholder: '73.0479' },
      { name: 'notes', label: 'Notes', kind: 'textarea', wide: true },
    ],
    columns: [
      { key: 'name', header: 'Location', sort: 'name', cell: (r) => <div>{link('locations', r, str(r.name))}<p className="text-[12px] text-muted">{str(r.address)}</p></div> },
      { key: 'kind', header: 'Kind', cell: (r, m) => dash(optLabel('locationKinds')(r, m, 'kind')) },
      { key: 'cases', header: 'Cases', sort: 'cases', firstOrder: 'desc', cell: counts },
      { key: 'ev', header: 'Evidence', cell: (r) => <span className="tabular">{Number(r.evidence_count ?? 0)}</span> },
      { key: 'clues', header: 'Clues', cell: (r) => <span className="tabular">{Number(r.clue_count ?? 0)}</span> },
    ],
    filters: [{ param: 'kind', label: 'Kind', source: 'locationKinds' }],
  },
  clue: {
    type: 'clue', plural: 'Clues', singular: 'Clue', apiPath: 'clues', title: 'Clues', titleField: 'title', codeField: 'clue_code', defaultSort: 'discovered', defaultOrder: 'desc',
    blurb: 'Observations and leads attached to a case. A clue’s confidence says how reliable it is; it is not proof.', searchHint: 'Search title, description, source or case number',
    fields: [
      { name: 'case_id', label: 'Case', kind: 'case', required: true, createOnly: true, wide: true },
      { name: 'title', label: 'Title', kind: 'text', required: true, wide: true },
      { name: 'description', label: 'Description', kind: 'textarea', wide: true },
      { name: 'discovered_at', label: 'Discovered on', kind: 'date', required: true },
      { name: 'location_id', label: 'Location', kind: 'location' },
      { name: 'confidence', label: 'Confidence', kind: 'select', options: 'confidenceLevels' },
      { name: 'status', label: 'Status', kind: 'select', options: 'clueStatuses' },
      { name: 'source', label: 'Source', kind: 'text', wide: true, placeholder: 'Who or what reported this' },
    ],
    columns: [
      { key: 'code', header: 'Code', sort: 'code', cell: (r) => code(r, 'clue_code') },
      { key: 'title', header: 'Clue', sort: 'title', cell: (r) => link('clues', r, str(r.title)) },
      { key: 'case', header: 'Case', cell: caseLink },
      { key: 'conf', header: 'Confidence', sort: 'confidence', firstOrder: 'desc', cell: (r, m) => <Badge tone={statusTone(str(r.confidence))}>{optLabel('confidenceLevels')(r, m, 'confidence')}</Badge> },
      { key: 'status', header: 'Status', cell: (r, m) => <Badge tone={statusTone(str(r.status))}>{optLabel('clueStatuses')(r, m, 'status')}</Badge> },
      { key: 'date', header: 'Discovered', sort: 'discovered', firstOrder: 'desc', cell: (r) => fmtDate(str(r.discovered_at)) },
    ],
    filters: [{ param: 'case_id', label: 'Case', source: 'cases' }, { param: 'status', label: 'Status', source: 'clueStatuses' }, { param: 'confidence', label: 'Confidence', source: 'confidenceLevels' }],
  },
  evidence: {
    type: 'evidence', plural: 'Evidence', singular: 'Evidence item', apiPath: 'evidence', title: 'Evidence', titleField: 'title', codeField: 'evidence_code', defaultSort: 'collected', defaultOrder: 'desc',
    blurb: 'Items collected for a case, each with an append-only chain of custody. Evidence is never deleted.', searchHint: 'Search title, description, code or case number',
    fields: [
      { name: 'case_id', label: 'Case', kind: 'case', required: true, createOnly: true, wide: true },
      { name: 'title', label: 'Title', kind: 'text', required: true, wide: true },
      { name: 'description', label: 'Description', kind: 'textarea', wide: true },
      { name: 'category', label: 'Category', kind: 'select', options: 'evidenceCategories' },
      { name: 'collected_at', label: 'Collected on', kind: 'date', required: true },
      { name: 'collected_location_id', label: 'Collected at', kind: 'location' },
      { name: 'storage_location', label: 'Storage location', kind: 'text', placeholder: 'e.g. Evidence room B, shelf 4' },
      { name: 'status', label: 'Status', kind: 'select', options: 'evidenceStatuses', editOnly: true },
    ],
    columns: [
      { key: 'code', header: 'Code', sort: 'code', cell: (r) => code(r, 'evidence_code') },
      { key: 'title', header: 'Item', sort: 'title', cell: (r) => link('evidence', r, str(r.title)) },
      { key: 'case', header: 'Case', cell: caseLink },
      { key: 'cat', header: 'Category', cell: (r, m) => dash(optLabel('evidenceCategories')(r, m, 'category')) },
      { key: 'status', header: 'Status', sort: 'status', cell: (r, m) => <Badge tone={statusTone(str(r.status))}>{optLabel('evidenceStatuses')(r, m, 'status')}</Badge> },
      { key: 'cust', header: 'Custodian', cell: (r) => dash(r.custodian_name) },
      { key: 'date', header: 'Collected', sort: 'collected', firstOrder: 'desc', cell: (r) => fmtDate(str(r.collected_at)) },
    ],
    filters: [{ param: 'case_id', label: 'Case', source: 'cases' }, { param: 'category', label: 'Category', source: 'evidenceCategories' }, { param: 'status', label: 'Status', source: 'evidenceStatuses' }],
  },
};

export const isPlainType = (t: string): t is PlainType => t in ENTITY_CONFIG;
export { humanize };
