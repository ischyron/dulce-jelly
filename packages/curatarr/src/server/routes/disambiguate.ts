/**
 * Disambiguation API routes
 * POST /api/disambiguate/batch        — enqueue a batch job
 * GET  /api/disambiguate/events       — SSE stream of results
 * GET  /api/disambiguate/pending      — pending review items
 * POST /api/disambiguate/:id/review   — confirm or reject a match
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import type { CuratDb } from '../../db/client.js';
import { disEmitter } from '../sse.js';
import { runDisambiguationQueue } from '../../disambiguation/queue.js';
import type { DisambiguateRequest } from '../../disambiguation/types.js';

export function makeDisambiguateRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/disambiguate/batch  { items: DisambiguateRequest[] }
  app.post('/batch', async (c) => {
    if (disEmitter.running) {
      return c.json({ error: 'Disambiguation job already running' }, 409);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const items = body.items as DisambiguateRequest[] | undefined;

    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'items must be a non-empty array' }, 400);
    }

    const jobId = randomUUID();
    const signal = disEmitter.start();

    setImmediate(async () => {
      try {
        await runDisambiguationQueue(jobId, items, db, { signal });
      } catch (err) {
        disEmitter.emit('error', { message: (err as Error).message });
      } finally {
        disEmitter.finish();
      }
    });

    return c.json({ jobId, queued: items.length });
  });

  // GET /api/disambiguate/events  — SSE
  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'status',
        data: JSON.stringify({ running: disEmitter.running }),
      });

      const unsub = disEmitter.subscribe(async (ev) => {
        try {
          await stream.writeSSE({ event: ev.event, data: JSON.stringify(ev.data) });
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

  // GET /api/disambiguate/pending
  app.get('/pending', (c) => {
    const items = db.getAmbiguousDisambiguations(200);
    const count = db.getDisambiguationCount();
    return c.json({ items, ...count });
  });

  // POST /api/disambiguate/:id/review  { decision: 'confirm' | 'reject' }
  app.post('/:id/review', async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const decision = body.decision as string;

    if (decision !== 'confirm' && decision !== 'reject') {
      return c.json({ error: 'decision must be "confirm" or "reject"' }, 400);
    }

    const updated = db.reviewDisambiguation(id, decision);
    return c.json({ updated });
  });

  return app;
}
