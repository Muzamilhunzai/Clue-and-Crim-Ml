import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config';
import type { Db } from './database/connection';
import { csrfGuard, loadSession } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/authRoutes';
import { caseRoutes } from './routes/caseRoutes';
import { entityRoutes } from './routes/entityRoutes';
import { dashboardRoutes, investigatorRoutes, labRoutes, metaRoutes, relationshipRoutes } from './routes/miscRoutes';

/** Build the Express app around an already-open database (tests pass an in-memory / temp-file one). */
export function createApp(db: Db): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The production build is served by this same server. General Sans is loaded from Fontshare when online.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://api.fontshare.com'],
          fontSrc: ["'self'", 'https://cdn.fontshare.com', 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use(loadSession(db));
  api.use(csrfGuard);

  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use('/auth', authRoutes(db));
  api.use('/cases', caseRoutes(db));
  api.use('/investigators', investigatorRoutes(db));
  api.use('/relationships', relationshipRoutes(db));
  api.use('/lab', labRoutes(db));
  api.use(metaRoutes(db));
  api.use(dashboardRoutes(db));
  api.use(entityRoutes(db));
  api.use(notFoundHandler);
  app.use('/api', api);

  // Production: serve the built React app and fall back to index.html for client-side routes.
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(indexHtml));
  }

  app.use(errorHandler);
  return app;
}
