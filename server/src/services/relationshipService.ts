import { z } from 'zod';
import type { Db } from '../database/connection';
import { inTransaction } from '../database/connection';
import { CONFIDENCE_LEVELS, ENTITY_TYPES, humanize, type EntityType } from '../domain/enums';
import { roleCan } from '../domain/permissions';
import type { AuthUser } from '../domain/types';
import { audit } from '../repositories/auditRepository';
import * as repo from '../repositories/relationshipRepository';
import type { Ref } from '../repositories/relationshipRepository';
import { conflict, forbidden, notFound, unprocessable, badRequest } from '../utils/errors';
import { oneOf, optionalText, parse, positiveInt } from '../utils/validation';
import * as caseService from './caseService';

const PEOPLE = ['suspect', 'victim', 'witness'] as const;
type PersonType = (typeof PEOPLE)[number];
const PLURAL: Record<PersonType, 'suspects' | 'victims' | 'witnesses'> = { suspect: 'suspects', victim: 'victims', witness: 'witnesses' };
const FK: Record<PersonType, string> = { suspect: 'suspect_id', victim: 'victim_id', witness: 'witness_id' };

const refSchema = z.object({ type: oneOf(ENTITY_TYPES, 'record type'), id: positiveInt });

export function parseRef(raw: string | undefined, name = 'focus'): Ref {
  const m = /^([a-z]+):(\d+)$/.exec(raw ?? '');
  if (!m || !(ENTITY_TYPES as readonly string[]).includes(m[1])) throw unprocessable(`Use ${name}=type:id, for example case:3.`);
  return { type: m[1] as EntityType, id: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// reading: graph, neighbours, lookup, hotspots, path
// ---------------------------------------------------------------------------

const MAX_NODES = 120;

export function graph(db: Db, focus: Ref, requestedDepth: number) {
  if (!repo.nodeExists(db, focus)) throw notFound('Record');
  const depth = Math.min(Math.max(Math.trunc(requestedDepth) || 2, 1), 3);

  // Reduce depth until the neighbourhood fits on screen. Depth 1 is always returned.
  let d = depth;
  let reach = repo.reachable(db, focus, d);
  while (reach.length > MAX_NODES && d > 1) reach = repo.reachable(db, focus, --d);
  let truncated = d < depth;
  if (reach.length > MAX_NODES) { reach = reach.slice(0, MAX_NODES); truncated = true; }

  const depthByKey = new Map(reach.map((r) => [`${r.type}:${r.id}`, r.depth]));
  const keys = [...depthByKey.keys()];
  const nodes = repo.nodesByKeys(db, keys, depthByKey);
  const edges = repo.edgesAmong(db, keys);

  const counts: Record<string, number> = {};
  nodes.forEach((n) => { counts[n.type] = (counts[n.type] ?? 0) + 1; });
  return { focus: `${focus.type}:${focus.id}`, depth: d, requested_depth: depth, truncated, nodes, edges, counts };
}

export function node(db: Db, ref: Ref) {
  const n = repo.getNode(db, ref);
  if (!n) throw notFound('Record');
  const links = repo.neighbors(db, ref);
  const byType: Record<string, number> = {};
  links.forEach((l) => { byType[l.other.type] = (byType[l.other.type] ?? 0) + 1; });
  return { node: n, links, counts_by_type: byType };
}

export function lookup(db: Db, type: string | undefined, q: string | undefined) {
  if (!type || !(ENTITY_TYPES as readonly string[]).includes(type)) throw unprocessable('Choose a record type.');
  return repo.lookup(db, type as EntityType, (q ?? '').trim().slice(0, 80));
}

/** Types plus the permitted (record type, record type, relationship type) combinations. */
export function rules(db: Db) {
  const r = repo.rules(db);
  const structural = PEOPLE.map((p) => ({
    a_type: 'case', b_type: p, relation_type: `${p}_in_case`, label: `${humanize(p)} in case`, structural: true,
  }));
  return { ...r, structural };
}

export function hotspots(db: Db) {
  const base = repo.hotspots(db);
  const topCases = db
    .prepare(
      `SELECT n.entity_id AS id, n.code, n.label, n.status, d.degree
         FROM v_node_degree d JOIN v_graph_nodes n ON n.entity_type = d.entity_type AND n.entity_id = d.entity_id
        WHERE d.entity_type = 'case' AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.id = n.entity_id AND c.is_archived = 1)
        ORDER BY d.degree DESC, n.entity_id DESC LIMIT 8`,
    )
    .all();
  return { ...base, topCases };
}

export function path(db: Db, from: Ref, to: Ref, maxDepth = 5) {
  if (!repo.nodeExists(db, from) || !repo.nodeExists(db, to)) throw notFound('Record');
  if (from.type === to.type && from.id === to.id) throw unprocessable('Choose two different records.');
  const keys = repo.shortestPath(db, from, to, Math.min(Math.max(maxDepth, 1), 6));
  if (!keys) return { found: false as const, nodes: [], edges: [] };
  const nodes = repo.nodesByKeys(db, keys, new Map(keys.map((k, i) => [k, i])));
  const order = new Map(keys.map((k, i) => [k, i]));
  nodes.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
  const all = repo.edgesAmong(db, keys);
  const edges = keys.slice(1).map((k, i) => {
    const prev = keys[i];
    return all.find((e) => (e.source === prev && e.target === k) || (e.source === k && e.target === prev));
  }).filter(Boolean);
  return { found: true as const, hops: keys.length - 1, nodes, edges };
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

const createSchema = z.object({
  a_type: oneOf(ENTITY_TYPES, 'record type'),
  a_id: positiveInt,
  b_type: oneOf(ENTITY_TYPES, 'record type'),
  b_id: positiveInt,
  relation_type: z.string().trim().min(1, 'Choose a relationship type.').max(40),
  description: z.string().trim().max(1000, 'Keep this under 1000 characters.').optional(),
  source: optionalText(200),
  confidence: oneOf(CONFIDENCE_LEVELS, 'confidence').optional(),
  // used when linking a person to a case
  involvement_status: z.string().optional(),
  notes: optionalText(1000),
});

function requireWrite(user: AuthUser) {
  if (!roleCan(user.role, 'relationship:write')) throw forbidden('Your role can view relationships but not change them.');
}

export function create(db: Db, user: AuthUser, body: unknown) {
  requireWrite(user);
  const d = parse(createSchema, body);
  let a: Ref = { type: d.a_type, id: d.a_id };
  let b: Ref = { type: d.b_type, id: d.b_id };

  if (a.type === b.type && a.id === b.id) throw unprocessable('A record cannot be related to itself.');
  for (const [ref, name] of [[a, 'first'], [b, 'second']] as const) {
    if (!repo.nodeExists(db, ref)) throw notFound(`The ${name} record`);
  }
  // canonical order (the same one the CHECK constraint demands): alphabetical by type, then id
  if (a.type > b.type || (a.type === b.type && a.id > b.id)) [a, b] = [b, a];

  // Case <-> person associations live in their own junction tables.
  if (a.type === 'case' && (PEOPLE as readonly string[]).includes(b.type)) {
    const kind = b.type as PersonType;
    const extra =
      kind === 'suspect'
        ? { involvement_status: d.involvement_status, notes: d.notes ?? d.description ?? undefined }
        : kind === 'victim'
          ? { notes: d.notes ?? d.description ?? undefined }
          : { notes: d.notes ?? d.description ?? undefined };
    caseService.linkPerson(db, user, a.id, PLURAL[kind], { [FK[kind]]: b.id, ...extra });
    return { id: `case_${PLURAL[kind]}:${a.id}:${b.id}`, structural: true };
  }

  if (!repo.ruleExists(db, a.type as EntityType, b.type as EntityType, d.relation_type)) {
    const allowed = (repo.rules(db).pairs as { a_type: string; b_type: string; relation_type: string }[])
      .filter((p) => p.a_type === a.type && p.b_type === b.type).map((p) => p.relation_type);
    throw unprocessable(
      allowed.length
        ? `"${humanize(d.relation_type)}" is not allowed between a ${a.type} and a ${b.type}. Allowed: ${allowed.map(humanize).join(', ')}.`
        : `A ${a.type} cannot be related to a ${b.type} here.`,
      { relation_type: 'This relationship type is not allowed for these records.' },
    );
  }

  const id = inTransaction(db, () => {
    const newId = repo.insertRelationship(db, {
      a_type: a.type, a_id: a.id, b_type: b.type, b_id: b.id,
      relation_type: d.relation_type,
      description: d.description ?? '',
      source: d.source ?? null,
      confidence: d.confidence ?? 'unverified',
      created_by: user.id,
    });
    audit(db, user, {
      action: 'relationship.create', entityType: 'relationship', entityId: newId,
      summary: `Recorded "${humanize(d.relation_type)}" between ${a.type} #${a.id} and ${b.type} #${b.id}. Recorded association, not a proven fact.`,
    });
    return newId;
  });
  return { id: `relationships:${id}`, structural: false };
}

const updateSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  source: optionalText(200),
  confidence: oneOf(CONFIDENCE_LEVELS, 'confidence').optional(),
});

export function update(db: Db, user: AuthUser, relId: number, body: unknown) {
  requireWrite(user);
  const patch = parse(updateSchema, body);
  if (!repo.getRelationship(db, relId)) throw notFound('Relationship');
  inTransaction(db, () => {
    repo.updateRelationship(db, relId, patch);
    audit(db, user, {
      action: 'relationship.update', entityType: 'relationship', entityId: relId,
      summary: `Edited relationship #${relId} (${Object.keys(patch).join(', ')})`,
    });
  });
  return { id: `relationships:${relId}` };
}

/** Remove an association. Edge ids look like "relationships:12" or "case_suspects:3:7". */
export function remove(db: Db, user: AuthUser, edgeId: string) {
  requireWrite(user);
  const [table, a, b] = edgeId.split(':');

  if (table === 'relationships') {
    const relId = Number(a);
    const rel = repo.getRelationship(db, relId);
    if (!rel) throw notFound('Relationship');
    inTransaction(db, () => {
      repo.deleteRelationship(db, relId);
      audit(db, user, {
        action: 'relationship.delete', entityType: 'relationship', entityId: relId,
        summary: `Removed "${humanize(rel.relation_type)}" between ${rel.a_type} #${rel.a_id} and ${rel.b_type} #${rel.b_id}`,
      });
    });
    return { deleted: true };
  }

  const kinds: Record<string, 'suspects' | 'victims' | 'witnesses'> = {
    case_suspects: 'suspects', case_victims: 'victims', case_witnesses: 'witnesses',
  };
  if (kinds[table] && Number(a) > 0 && Number(b) > 0) {
    caseService.unlinkPerson(db, user, Number(a), kinds[table], Number(b));
    return { deleted: true };
  }
  throw badRequest(
    'This connection comes from the record itself (for example the case an evidence item belongs to, or its location). Edit that record to change it.',
  );
}

export { conflict };
