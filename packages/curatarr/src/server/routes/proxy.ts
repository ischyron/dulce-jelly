/**
 * Proxy routes — forwards Jellyfin images through Curatarr.
 * No storage duplication; works in all network topologies.
 */

import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';

export function makeProxyRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/proxy/image/:jellyfinId
  // Proxies the Primary poster image from Jellyfin.
  // The client never needs to know the Jellyfin URL or API key.
  app.get('/image/:jellyfinId', async (c) => {
    const jellyfinId = c.req.param('jellyfinId');
    const baseUrl = (db.getSetting('jellyfinUrl') ?? process.env.JELLYFIN_URL ?? '').replace(/\/$/, '');
    const apiKey = db.getSetting('jellyfinApiKey') ?? process.env.JELLYFIN_API_KEY ?? '';

    if (!baseUrl || !apiKey) {
      return c.json({ error: 'Jellyfin not configured' }, 503);
    }

    const jfUrl = `${baseUrl}/Items/${jellyfinId}/Images/Primary?maxHeight=400&quality=90`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(jfUrl, {
        headers: { 'X-Emby-Token': apiKey },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return c.body(null, res.status as 404 | 500);
      }

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const body = await res.arrayBuffer();

      return c.body(body, 200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',   // 24 h client-side cache
      });
    } catch {
      return c.json({ error: 'Failed to fetch image from Jellyfin' }, 502);
    }
  });

  return app;
}
