import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CuratDb } from '../../db/client.js';
import { syncEmitter } from '../sse.js';
import { JellyfinClient } from '../../jellyfin/client.js';
import { syncJellyfin } from '../../jellyfin/sync.js';

export function makeSyncRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/jf-sync  { url?: string, apiKey?: string, resync?: boolean }
  app.post('/', async (c) => {
    if (syncEmitter.running) {
      return c.json({ error: 'Sync already running' }, 409);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const resync = Boolean(body.resync);

    // Resolve Jellyfin connection from settings or env
    const url = (body.url as string)
      ?? db.getSetting('jellyfinUrl')
      ?? process.env.JELLYFIN_URL
      ?? process.env.JELLYFIN_BASE_URL
      ?? '';
    const apiKey = (body.apiKey as string)
      ?? db.getSetting('jellyfinApiKey')
      ?? process.env.JELLYFIN_API_KEY
      ?? '';

    if (!url || !apiKey) {
      return c.json({ error: 'Jellyfin URL and API key required. Configure in Settings.' }, 400);
    }

    const signal = syncEmitter.start();
    syncEmitter.emit('start', { url, resync });

    setImmediate(async () => {
      try {
        const jfClient = new JellyfinClient(url, apiKey);
        const result = await syncJellyfin(jfClient, db, {
          resync,
          signal,
          onProgress: (synced, total, matched, unmatched) => {
            syncEmitter.emit('progress', { synced, total, matched, unmatched });
          },
          onAmbiguous: (item) => {
            syncEmitter.emit('ambiguous', item);
          },
        });
        if (signal.aborted) {
          syncEmitter.emit('complete', { ...result, cancelled: true });
        } else {
          syncEmitter.emit('complete', result);
        }
      } catch (err) {
        syncEmitter.emit('error', { message: (err as Error).message });
      } finally {
        syncEmitter.finish();
      }
    });

    return c.json({ started: true, url, resync });
  });

  // POST /api/jf-sync/cancel
  app.post('/cancel', (c) => {
    const cancelled = syncEmitter.cancel();
    return c.json({ cancelled });
  });

  // GET /api/jf-sync/status
  app.get('/status', (c) => {
    return c.json({ running: syncEmitter.running });
  });

  // GET /api/jf-sync/events  — SSE stream
  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'status',
        data: JSON.stringify({ running: syncEmitter.running }),
      });

      const unsub = syncEmitter.subscribe(async (ev) => {
        try {
          await stream.writeSSE({
            event: ev.event,
            data: JSON.stringify(ev.data),
          });
        } catch { /* client disconnected */ }
      });

      await new Promise<void>((resolve) => {
        const keepAlive = setInterval(async () => {
          try {
            await stream.writeSSE({ event: 'ping', data: '' });
          } catch {
            clearInterval(keepAlive);
            resolve();
          }
        }, 15_000);

        stream.onAbort(() => {
          clearInterval(keepAlive);
          unsub();
          resolve();
        });
      });
    });
  });

  return app;
}
