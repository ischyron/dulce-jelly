import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { JellyfinClient } from '../../jellyfin/client.js';

export function makeSettingsRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/settings
  app.get('/', (c) => {
    const settings = db.getAllSettings();
    // Mask API keys in response (show last 4 chars only)
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (k.toLowerCase().includes('apikey') || k.toLowerCase().includes('api_key')) {
        safe[k] = v ? `****${v.slice(-4)}` : '';
      } else {
        safe[k] = v;
      }
    }
    return c.json({ settings: safe });
  });

  // PUT /api/settings  { key: value, ... }
  app.put('/', async (c) => {
    const body = await c.req.json() as Record<string, string>;
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'string') {
        db.setSetting(k, v);
      }
    }
    return c.json({ saved: Object.keys(body) });
  });

  // GET /api/settings/health — test Jellyfin connectivity
  app.get('/health', async (c) => {
    const url = db.getSetting('jellyfinUrl') ?? process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL ?? '';
    const apiKey = db.getSetting('jellyfinApiKey') ?? process.env.JELLYFIN_API_KEY ?? '';

    if (!url || !apiKey) {
      return c.json({ jellyfin: { ok: false, error: 'Not configured' } });
    }

    try {
      const client = new JellyfinClient(url, apiKey);
      const libs = await client.getLibraries();
      c.header('Cache-Control', 'max-age=30, stale-while-revalidate=60');
      return c.json({ jellyfin: { ok: true, libraries: libs.length } });
    } catch (err) {
      return c.json({ jellyfin: { ok: false, error: (err as Error).message } });
    }
  });

  return app;
}
