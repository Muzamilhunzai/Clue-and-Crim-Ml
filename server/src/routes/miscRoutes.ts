import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../database/connection';
import { META } from '../domain/enums';
import { PERMISSIONS } from '../domain/permissions';
import { requireAuth, requirePermission } from '../middleware/auth';
import { listActivity } from '../repositories/auditRepository';
import * as dashboard from '../services/dashboardService';
import * as investigators from '../services/investigatorService';
import * as lab from '../services/labService';
import * as rel from '../services/relationshipService';
import { search } from '../services/searchService';
import { notFound } from '../utils/errors';
import { idParam, pageParams, parse } from '../utils/validation';

export function metaRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth);
  r.get('/meta', (req, res) => res.json({ ...META, permissions: PERMISSIONS[req.user!.role] }));
  /** Small id/label lists used by pickers (assignees, cases, locations). */
  r.get('/lookups', (_req, res) => {
    res.json({
      users: investigators.options(db),
      cases: db.prepare(`SELECT id, case_number, title, status, is_archived FROM cases ORDER BY case_number DESC`).all(),
      locations: db.prepare(`SELECT id, name, address, kind FROM locations ORDER BY name COLLATE NOCASE`).all(),
    });
  });
  return r;
}

export function dashboardRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth);
  r.get('/dashboard', (req, res) => {
    const tz = Number(req.query.tz);
    res.json(dashboard.getDashboard(db, req.user!, Number.isFinite(tz) ? Math.max(-840, Math.min(840, tz)) : 0));
  });
  r.get('/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    res.json({ q, results: search(db, q) });
  });
  r.get('/activity', (req, res) => {
    const q = parse(pageParams.extend({ entity_type: z.string().max(30).optional(), user_id: z.coerce.number().int().positive().optional(), case_id: z.coerce.number().int().positive().optional() }), req.query);
    res.json(listActivity(db, { page: q.page, pageSize: q.pageSize, q: q.q, entityType: q.entity_type, userId: q.user_id, caseId: q.case_id }));
  });
  return r;
}

export function investigatorRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth);
  r.get('/', (req, res) => res.json({ items: investigators.list(db, req.user!) }));
  r.post('/', async (req, res) => res.status(201).json(await investigators.create(db, req.user!, req.body)));
  r.get('/:id', (req, res) => res.json(investigators.get(db, req.user!, idParam(req.params.id))));
  r.patch('/:id', (req, res) => res.json(investigators.update(db, req.user!, idParam(req.params.id), req.body)));
  r.post('/:id/reset-password', async (req, res) => res.json(await investigators.resetPassword(db, req.user!, idParam(req.params.id), req.body)));
  return r;
}

export function relationshipRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth);
  r.get('/graph', (req, res) => {
    res.json(rel.graph(db, rel.parseRef(req.query.focus as string | undefined), Number(req.query.depth ?? 2)));
  });
  r.get('/node/:ref', (req, res) => res.json(rel.node(db, rel.parseRef(req.params.ref, 'ref'))));
  r.get('/lookup', (req, res) => res.json({ items: rel.lookup(db, req.query.type as string | undefined, req.query.q as string | undefined) }));
  r.get('/rules', (_req, res) => res.json(rel.rules(db)));
  r.get('/hotspots', (_req, res) => res.json(rel.hotspots(db)));
  r.get('/path', (req, res) => {
    res.json(rel.path(db, rel.parseRef(req.query.from as string | undefined, 'from'), rel.parseRef(req.query.to as string | undefined, 'to'), Number(req.query.max ?? 5)));
  });
  r.post('/', (req, res) => res.status(201).json(rel.create(db, req.user!, req.body)));
  r.patch('/:id', (req, res) => res.json(rel.update(db, req.user!, idParam(req.params.id), req.body)));
  r.delete('/:edgeId', (req, res) => res.json(rel.remove(db, req.user!, req.params.edgeId)));
  return r;
}

export function labRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth, requirePermission('lab:use'));
  r.get('/overview', (_req, res) => res.json(lab.overview(db)));
  r.get('/schema', (_req, res) => res.json(lab.schema(db)));
  r.get('/plans', (_req, res) => res.json({ items: lab.queryPlans(db) }));
  r.get('/views', (_req, res) => res.json({ items: lab.viewNames() }));
  r.get('/views/:name', (req, res) => {
    const rows = lab.previewView(db, req.params.name);
    if (!rows) throw notFound('View');
    res.json({ name: req.params.name, rows });
  });
  r.get('/demos', (_req, res) => res.json({ items: lab.DEMOS }));
  r.post('/demos/:id', (req, res) => {
    const result = lab.runDemo(db, req.params.id);
    if (!result) throw notFound('Demo');
    res.json(result);
  });
  return r;
}
