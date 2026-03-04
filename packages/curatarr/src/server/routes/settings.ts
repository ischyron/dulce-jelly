import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { JellyfinClient } from '../../jellyfin/client.js';
import { syncScoringYamlFromSettings } from '../../shared/scoutDefaults.js';

export function makeSettingsRoutes(db: CuratDb): Hono {
  const app = new Hono();

  async function testProwlarr(url: string, apiKey: string): Promise<{ ok: boolean; indexers?: number; error?: string }> {
    const endpoint = `${url.replace(/\/+$/, '')}/api/v1/indexer`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey },
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return { ok: false, error: `Prowlarr error ${res.status}${detail ? `: ${detail}` : ''}` };
      }
      const body = await res.json().catch(() => []);
      const indexers = Array.isArray(body) ? body.length : 0;
      return { ok: true, indexers };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }

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
    let scoringYamlSynced = true;
    try {
      const merged = db.getAllSettings();
      syncScoringYamlFromSettings(merged);
    } catch (err) {
      scoringYamlSynced = false;
      console.error(`[settings] failed to sync scoring.yaml: ${(err as Error).message}`);
    }
    return c.json({ saved: Object.keys(body), scoringYamlSynced });
  });

  // GET /api/settings/health — test Jellyfin + Prowlarr connectivity
  // Accepts optional query params to test unsaved form values.
  // Falls back to saved DB settings when not provided.
  app.get('/health', async (c) => {
    const qJfUrl = c.req.query('url') ?? '';
    const qJfApiKey = c.req.query('apiKey') ?? '';
    const qProwlarrUrl = c.req.query('prowlarrUrl') ?? '';
    const qProwlarrApiKey = c.req.query('prowlarrApiKey') ?? '';

    const jfUrl = qJfUrl || db.getSetting('jellyfinUrl') || '';
    const jfApiKey = qJfApiKey || db.getSetting('jellyfinApiKey') || '';
    const prowlarrUrl = qProwlarrUrl || db.getSetting('prowlarrUrl') || '';
    const prowlarrApiKey = qProwlarrApiKey || db.getSetting('prowlarrApiKey') || '';

    const base = {
      jellyfin: { ok: false, error: 'Not configured' } as { ok: boolean; libraries?: number; error?: string },
      prowlarr: { ok: false, error: 'Not configured' } as { ok: boolean; indexers?: number; error?: string },
    };

    if (!jfUrl || !jfApiKey) {
      if (!prowlarrUrl || !prowlarrApiKey) {
        return c.json(base);
      }
      const prowlarr = await testProwlarr(prowlarrUrl, prowlarrApiKey);
      return c.json({ ...base, prowlarr });
    }

    try {
      const client = new JellyfinClient(jfUrl, jfApiKey);
      const libs = await client.getLibraries();
      const jellyfin = { ok: true, libraries: libs.length };
      if (!prowlarrUrl || !prowlarrApiKey) {
        return c.json({ jellyfin, prowlarr: base.prowlarr });
      }
      const prowlarr = await testProwlarr(prowlarrUrl, prowlarrApiKey);
      return c.json({ jellyfin, prowlarr });
    } catch (err) {
      const jellyfin = { ok: false, error: (err as Error).message };
      if (!prowlarrUrl || !prowlarrApiKey) {
        return c.json({ jellyfin, prowlarr: base.prowlarr });
      }
      const prowlarr = await testProwlarr(prowlarrUrl, prowlarrApiKey);
      return c.json({ jellyfin, prowlarr });
    }
  });

  return app;
}
