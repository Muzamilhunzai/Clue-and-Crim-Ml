import { Router } from 'express';
import type { Db } from '../database/connection';
import { ENTITIES } from '../domain/entities';
import { requireAuth } from '../middleware/auth';
import * as entities from '../services/entityService';
import * as evidenceService from '../services/evidenceService';
import { idParam } from '../utils/validation';

/** One router per record type, generated from the entity registry: /api/suspects, /api/victims, ... */
export function entityRoutes(db: Db): Router {
  const root = Router();
  root.use(requireAuth);

  for (const def of Object.values(ENTITIES)) {
    const r = Router();
    r.get('/', (req, res) => res.json(entities.list(db, req.user!, def, req.query)));
    r.post('/', (req, res) => res.status(201).json(entities.create(db, req.user!, def, req.body)));
    r.get('/:id', (req, res) => res.json(entities.get(db, req.user!, def, idParam(req.params.id))));
    r.patch('/:id', (req, res) => res.json(entities.update(db, req.user!, def, idParam(req.params.id), req.body)));
    r.delete('/:id', (req, res) => res.json(entities.remove(db, req.user!, def, idParam(req.params.id))));

    if (def.type === 'evidence') {
      r.get('/:id/custody', (req, res) => res.json(evidenceService.chain(db, idParam(req.params.id))));
      r.post('/:id/custody', (req, res) =>
        res.status(201).json(evidenceService.transfer(db, req.user!, idParam(req.params.id), req.body)));
    }
    root.use(`/${def.plural}`, r);
  }
  return root;
}
