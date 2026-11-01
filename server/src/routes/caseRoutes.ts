import { Router } from 'express';
import type { Db } from '../database/connection';
import { requireAuth } from '../middleware/auth';
import * as svc from '../services/caseService';
import { badRequest } from '../utils/errors';
import { idParam } from '../utils/validation';
import { LINKS, type LinkKind } from '../repositories/caseRepository';
import { caseSelectOptions } from '../repositories/caseRepository';

const kindOf = (raw: string): LinkKind => {
  if (!(raw in LINKS)) throw badRequest('Unknown link type. Use suspects, victims or witnesses.');
  return raw as LinkKind;
};

export function caseRoutes(db: Db): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (req, res) => res.json(svc.listCases(db, req.user!, req.query)));
  r.get('/board', (req, res) => res.json(svc.board(db, req.user!, req.query)));
  r.get('/options', (_req, res) => res.json({ items: caseSelectOptions(db) }));
  r.post('/', (req, res) => res.status(201).json(svc.createCase(db, req.user!, req.body)));

  r.get('/:id', (req, res) => res.json(svc.getCaseDetail(db, req.user!, idParam(req.params.id))));
  r.patch('/:id', (req, res) => res.json(svc.updateCase(db, req.user!, idParam(req.params.id), req.body)));
  r.patch('/:id/status', (req, res) => res.json(svc.changeStatus(db, req.user!, idParam(req.params.id), req.body)));
  r.post('/:id/archive', (req, res) => res.json(svc.setArchived(db, req.user!, idParam(req.params.id), true)));
  r.post('/:id/unarchive', (req, res) => res.json(svc.setArchived(db, req.user!, idParam(req.params.id), false)));

  r.post('/:id/investigators', (req, res) => res.status(201).json(svc.assignInvestigator(db, req.user!, idParam(req.params.id), req.body)));
  r.delete('/:id/investigators/:userId', (req, res) =>
    res.json(svc.removeInvestigator(db, req.user!, idParam(req.params.id), idParam(req.params.userId, 'user id'))));

  r.post('/:id/notes', (req, res) => res.status(201).json({ notes: svc.addNote(db, req.user!, idParam(req.params.id), req.body) }));

  r.post('/:id/:kind', (req, res) =>
    res.status(201).json(svc.linkPerson(db, req.user!, idParam(req.params.id), kindOf(req.params.kind), req.body)));
  r.patch('/:id/:kind/:entityId', (req, res) =>
    res.json(svc.updatePersonLink(db, req.user!, idParam(req.params.id), kindOf(req.params.kind), idParam(req.params.entityId, 'record id'), req.body)));
  r.delete('/:id/:kind/:entityId', (req, res) =>
    res.json(svc.unlinkPerson(db, req.user!, idParam(req.params.id), kindOf(req.params.kind), idParam(req.params.entityId, 'record id'))));

  return r;
}
