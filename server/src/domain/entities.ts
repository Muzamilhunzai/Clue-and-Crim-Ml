import { z, type ZodObject, type ZodRawShape } from 'zod';
import {
  CLUE_STATUSES, CONFIDENCE_LEVELS, EVIDENCE_CATEGORIES, EVIDENCE_STATUSES,
  GENDERS, LOCATION_KINDS, VICTIM_TYPES, type EntityType,
} from './enums';
import { oneOf, optionalDate, optionalId, optionalText, positiveInt, text, isoDate } from '../utils/validation';

/**
 * Declarative description of the "plain" record types (everything except cases,
 * which have their own workflow). One generic repository/service/route set is
 * driven by these definitions, so every entity gets identical, tested behaviour:
 * search, filter, sort, paginate, create, update, delete, audit and masking.
 */
export type PlainEntityType = Exclude<EntityType, 'case'>;

export interface EntityDef {
  type: PlainEntityType;
  table: string;
  plural: string;                    // URL segment: /api/suspects
  singular: string;                  // for messages
  titleColumn: string;               // column shown as the record's name
  codeColumn?: string;
  createdByColumn?: string;
  /** SELECT with alias `t` and any joins/subselect columns. No WHERE/ORDER. */
  selectSql: string;
  searchColumns: string[];
  /** query-param -> SQL condition using @v for the value */
  filters: Record<string, string>;
  sorts: Record<string, string>;
  defaultSort: string;
  defaultOrder: 'asc' | 'desc';
  /** columns that may be written on create / update (whitelist for the dynamic SQL) */
  createShape: ZodRawShape;
  updateShape: ZodRawShape;
  deletable: boolean;
  /** permission names (see domain/permissions.ts) */
  writePermission: 'people:write' | 'clue:write' | 'location:write' | 'evidence:create';
  updatePermission: 'people:write' | 'clue:write' | 'location:write' | 'evidence:update';
  deletePermission?: 'people:delete' | 'clue:delete' | 'location:delete';
}

const bool01 = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((v) => (v ? 1 : 0));

const coord = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().min(min, `Must be between ${min} and ${max}.`).max(max, `Must be between ${min} and ${max}.`).nullable().optional(),
  );

const dateOrDateTime = z
  .string({ error: 'This field is required.' })
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'Use a valid date (YYYY-MM-DD).')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Use a valid date (YYYY-MM-DD).');

const longText = z.string().trim().max(4000, 'Keep this under 4000 characters.');

const suspectShape: ZodRawShape = {
  full_name: text(2, 120),
  alias: optionalText(80),
  gender: oneOf(GENDERS, 'gender').optional(),
  date_of_birth: optionalDate,
  occupation: optionalText(120),
  physical_description: optionalText(500),
  last_known_address: optionalText(200),
  notes: optionalText(2000),
};

const victimShape: ZodRawShape = {
  full_name: text(2, 120),
  victim_type: oneOf(VICTIM_TYPES, 'victim type').optional(),
  date_of_birth: optionalDate,
  phone: optionalText(40),
  email: optionalText(120),
  address: optionalText(200),
  notes: optionalText(2000),
};

const witnessShape: ZodRawShape = {
  full_name: text(2, 120),
  occupation: optionalText(120),
  phone: optionalText(40),
  email: optionalText(120),
  address: optionalText(200),
  is_protected: bool01.optional(),
  notes: optionalText(2000),
};

const locationShape: ZodRawShape = {
  name: text(2, 120),
  address: text(1, 200),
  city: text(1, 80).optional(),
  kind: oneOf(LOCATION_KINDS, 'location kind').optional(),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  notes: optionalText(1000),
};

const clueShape: ZodRawShape = {
  title: text(3, 160),
  description: longText.optional(),
  source: optionalText(160),
  discovered_at: isoDate,
  location_id: optionalId,
  confidence: oneOf(CONFIDENCE_LEVELS, 'confidence').optional(),
  status: oneOf(CLUE_STATUSES, 'status').optional(),
};

const evidenceShape: ZodRawShape = {
  title: text(3, 160),
  description: longText.optional(),
  category: oneOf(EVIDENCE_CATEGORIES, 'category').optional(),
  collected_at: dateOrDateTime,
  collected_location_id: optionalId,
  storage_location: optionalText(120),
};

const caseCountSub = (table: string, fk: string) => `(SELECT COUNT(*) FROM ${table} x WHERE x.${fk} = t.id)`;

export const ENTITIES: Record<PlainEntityType, EntityDef> = {
  suspect: {
    type: 'suspect', table: 'suspects', plural: 'suspects', singular: 'suspect',
    titleColumn: 'full_name', codeColumn: 'suspect_code', createdByColumn: 'created_by',
    selectSql: `SELECT t.*, ${caseCountSub('case_suspects', 'suspect_id')} AS case_count FROM suspects t`,
    searchColumns: ['t.full_name', 't.alias', 't.suspect_code', 't.occupation'],
    filters: {
      gender: 't.gender = @v',
      involvement_status: 'EXISTS (SELECT 1 FROM case_suspects cs WHERE cs.suspect_id = t.id AND cs.involvement_status = @v)',
      case_id: 'EXISTS (SELECT 1 FROM case_suspects cs WHERE cs.suspect_id = t.id AND cs.case_id = @v)',
    },
    sorts: { name: 't.full_name COLLATE NOCASE', code: 't.suspect_code', created: 't.created_at', cases: 'case_count' },
    defaultSort: 'name', defaultOrder: 'asc',
    createShape: suspectShape, updateShape: suspectShape, deletable: true,
    writePermission: 'people:write', updatePermission: 'people:write', deletePermission: 'people:delete',
  },
  victim: {
    type: 'victim', table: 'victims', plural: 'victims', singular: 'victim',
    titleColumn: 'full_name', codeColumn: 'victim_code', createdByColumn: 'created_by',
    selectSql: `SELECT t.*, ${caseCountSub('case_victims', 'victim_id')} AS case_count FROM victims t`,
    searchColumns: ['t.full_name', 't.victim_code'],
    filters: {
      victim_type: 't.victim_type = @v',
      case_id: 'EXISTS (SELECT 1 FROM case_victims cv WHERE cv.victim_id = t.id AND cv.case_id = @v)',
    },
    sorts: { name: 't.full_name COLLATE NOCASE', code: 't.victim_code', created: 't.created_at', cases: 'case_count' },
    defaultSort: 'name', defaultOrder: 'asc',
    createShape: victimShape, updateShape: victimShape, deletable: true,
    writePermission: 'people:write', updatePermission: 'people:write', deletePermission: 'people:delete',
  },
  witness: {
    type: 'witness', table: 'witnesses', plural: 'witnesses', singular: 'witness',
    titleColumn: 'full_name', codeColumn: 'witness_code', createdByColumn: 'created_by',
    selectSql: `SELECT t.*, ${caseCountSub('case_witnesses', 'witness_id')} AS case_count FROM witnesses t`,
    searchColumns: ['t.full_name', 't.witness_code', 't.occupation'],
    filters: {
      is_protected: 't.is_protected = @v',
      follow_up_status: 'EXISTS (SELECT 1 FROM case_witnesses cw WHERE cw.witness_id = t.id AND cw.follow_up_status = @v)',
      case_id: 'EXISTS (SELECT 1 FROM case_witnesses cw WHERE cw.witness_id = t.id AND cw.case_id = @v)',
    },
    sorts: { name: 't.full_name COLLATE NOCASE', code: 't.witness_code', created: 't.created_at', cases: 'case_count' },
    defaultSort: 'name', defaultOrder: 'asc',
    createShape: witnessShape, updateShape: witnessShape, deletable: true,
    writePermission: 'people:write', updatePermission: 'people:write', deletePermission: 'people:delete',
  },
  location: {
    type: 'location', table: 'locations', plural: 'locations', singular: 'location',
    titleColumn: 'name',
    selectSql: `SELECT t.*,
        (SELECT COUNT(*) FROM cases c WHERE c.location_id = t.id) AS case_count,
        (SELECT COUNT(*) FROM evidence e WHERE e.collected_location_id = t.id) AS evidence_count,
        (SELECT COUNT(*) FROM clues k WHERE k.location_id = t.id) AS clue_count
      FROM locations t`,
    searchColumns: ['t.name', 't.address', 't.city'],
    filters: { kind: 't.kind = @v' },
    sorts: { name: 't.name COLLATE NOCASE', created: 't.created_at', cases: 'case_count' },
    defaultSort: 'name', defaultOrder: 'asc',
    createShape: locationShape, updateShape: locationShape, deletable: true,
    writePermission: 'location:write', updatePermission: 'location:write', deletePermission: 'location:delete',
  },
  clue: {
    type: 'clue', table: 'clues', plural: 'clues', singular: 'clue',
    titleColumn: 'title', codeColumn: 'clue_code', createdByColumn: 'created_by',
    selectSql: `SELECT t.*, c.case_number, c.title AS case_title, l.name AS location_name
      FROM clues t JOIN cases c ON c.id = t.case_id LEFT JOIN locations l ON l.id = t.location_id`,
    searchColumns: ['t.title', 't.description', 't.clue_code', 't.source', 'c.case_number'],
    filters: {
      case_id: 't.case_id = @v', status: 't.status = @v', confidence: 't.confidence = @v', location_id: 't.location_id = @v',
    },
    sorts: { created: 't.created_at', discovered: 't.discovered_at', title: 't.title COLLATE NOCASE', code: 't.clue_code', confidence: 't.confidence' },
    defaultSort: 'discovered', defaultOrder: 'desc',
    createShape: { case_id: positiveInt, ...clueShape }, updateShape: clueShape, deletable: true,
    writePermission: 'clue:write', updatePermission: 'clue:write', deletePermission: 'clue:delete',
  },
  evidence: {
    type: 'evidence', table: 'evidence', plural: 'evidence', singular: 'evidence item',
    titleColumn: 'title', codeColumn: 'evidence_code', createdByColumn: undefined,
    selectSql: `SELECT t.*, c.case_number, c.title AS case_title, l.name AS location_name,
        u.full_name AS custodian_name, cb.full_name AS collected_by_name
      FROM evidence t
      JOIN cases c ON c.id = t.case_id
      LEFT JOIN locations l ON l.id = t.collected_location_id
      JOIN users u ON u.id = t.current_custodian_id
      JOIN users cb ON cb.id = t.collected_by`,
    searchColumns: ['t.title', 't.description', 't.evidence_code', 'c.case_number'],
    filters: {
      case_id: 't.case_id = @v', category: 't.category = @v', status: 't.status = @v',
      custodian_id: 't.current_custodian_id = @v', location_id: 't.collected_location_id = @v',
    },
    sorts: { collected: 't.collected_at', title: 't.title COLLATE NOCASE', code: 't.evidence_code', status: 't.status', created: 't.created_at' },
    defaultSort: 'collected', defaultOrder: 'desc',
    createShape: { case_id: positiveInt, ...evidenceShape },
    updateShape: { ...evidenceShape, status: oneOf(EVIDENCE_STATUSES, 'status').optional() },
    deletable: false,
    writePermission: 'evidence:create', updatePermission: 'evidence:update',
  },
};

export const ENTITY_BY_PLURAL = Object.fromEntries(Object.values(ENTITIES).map((d) => [d.plural, d])) as Record<string, EntityDef>;

export const createSchemaOf = (d: EntityDef): ZodObject<ZodRawShape> => z.object(d.createShape);
export const updateSchemaOf = (d: EntityDef): ZodObject<ZodRawShape> => z.object(d.updateShape).partial();
