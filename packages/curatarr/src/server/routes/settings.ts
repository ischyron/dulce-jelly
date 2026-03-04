import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { JellyfinClient } from '../../jellyfin/client.js';

export function makeSettingsRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/settings
  app.get('/', (c) => {
    const settings = db.getAllSettings();

    // Env var fallbacks for fields that may not be saved in DB yet
    if (!settings.jellyfinUrl)
      settings.jellyfinUrl = process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL ?? '';
    if (!settings.jellyfinPublicUrl)
      settings.jellyfinPublicUrl = process.env.JELLYFIN_PUBLIC_URL ?? '';
    if (!settings.jellyfinApiKey)
      settings.jellyfinApiKey = process.env.JELLYFIN_API_KEY ?? '';
    if (!settings.prowlarrUrl)
      settings.prowlarrUrl = process.env.PROWLARR_URL ?? '';
    if (!settings.prowlarrApiKey)
      settings.prowlarrApiKey = process.env.PROWLARR_API_KEY ?? '';

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
  // Accepts optional ?url=&apiKey= query params to test unsaved form values.
  // Falls back to saved DB / env vars when not provided.
  app.get('/health', async (c) => {
    const qUrl    = c.req.query('url')    ?? '';
    const qApiKey = c.req.query('apiKey') ?? '';

    const url    = qUrl    || db.getSetting('jellyfinUrl')    || process.env.JELLYFIN_URL    || process.env.JELLYFIN_BASE_URL || '';
    const apiKey = qApiKey || db.getSetting('jellyfinApiKey') || process.env.JELLYFIN_API_KEY || '';

    if (!url || !apiKey) {
      return c.json({ jellyfin: { ok: false, error: 'Not configured' } });
    }

    try {
      const client = new JellyfinClient(url, apiKey);
      const libs = await client.getLibraries();
      return c.json({ jellyfin: { ok: true, libraries: libs.length } });
    } catch (err) {
      return c.json({ jellyfin: { ok: false, error: (err as Error).message } });
    }
  });

  return app;
}
