import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import type { Stats } from '../../shared/types/api.js';

export function makeStatsRoutes(db: CuratDb): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const stats = db.getStats();
    const lastScan = db.getLastScanRun();
    return c.json<Stats>({ ...stats, lastScan });
  });

  return app;
}
