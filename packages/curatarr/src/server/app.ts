/**
 * Hono application factory.
 * Creates the API router and static file serving for the React SPA.
 */

import path from 'node:path';
import fs from 'node:fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import type { CuratDb } from '../db/client.js';
import { makeStatsRoutes } from './routes/stats.js';
import { makeMoviesRoutes } from './routes/movies.js';
import { makeScanRoutes } from './routes/scan.js';
import { makeSyncRoutes } from './routes/sync.js';
import { makeCandidatesRoutes } from './routes/candidates.js';
import { makeRulesRoutes } from './routes/rules.js';
import { makeSettingsRoutes } from './routes/settings.js';
import { makeDisambiguateRoutes } from './routes/disambiguate.js';
import { makeVerifyRoutes } from './routes/verify.js';

export function createApp(db: CuratDb, distUiPath: string): Hono {
  const app = new Hono();

  // HTTP request logging (visible in docker logs curatarr)
  app.use('*', logger());

  // CORS for Vite dev server (port 5173)
  app.use('/api/*', cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── API Routes ────────────────────────────────────────────────────
  app.route('/api/stats', makeStatsRoutes(db));
  app.route('/api/movies', makeMoviesRoutes(db));
  app.route('/api/scan', makeScanRoutes(db));
  app.route('/api/jf-sync', makeSyncRoutes(db));
  app.route('/api/candidates', makeCandidatesRoutes(db));
  app.route('/api/rules', makeRulesRoutes(db));
  app.route('/api/settings', makeSettingsRoutes(db));
  app.route('/api/disambiguate', makeDisambiguateRoutes(db));
  app.route('/api/verify', makeVerifyRoutes(db));

  // ── Static SPA ────────────────────────────────────────────────────
  // @hono/node-server/serve-static resolves root relative to process.cwd().
  // Compute a relative path so it works regardless of launch directory.
  const relRoot = path.relative(process.cwd(), distUiPath);
  const uiExists = fs.existsSync(distUiPath);

  if (uiExists) {
    app.use('/*', serveStatic({ root: relRoot }));
    // SPA fallback — serve index.html for client-side routes
    app.get('/*', serveStatic({ root: relRoot, path: '/index.html' }));
  } else {
    app.get('/*', (c) => c.json({
      error: 'UI not built',
      hint: 'Run: npm run build:ui  (in packages/curatarr/)',
      api: '/api/*',
    }, 503));
  }

  return app;
}
