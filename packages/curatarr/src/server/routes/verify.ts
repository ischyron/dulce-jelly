/**
 * Deep verify API routes
 * POST /api/verify/start    — start a verify batch
 * POST /api/verify/cancel   — cancel running verify
 * GET  /api/verify/events   — SSE stream of progress
 * GET  /api/verify/status   — current status
 * GET  /api/verify/failures — paginated list of failed files
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CuratDb } from '../../db/client.js';
import { startVerifyQueue } from '../../scanner/verifyQueue.js';
import { verifyEmitter } from '../sse.js';

export function makeVerifyRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/verify/start  { concurrency?: 3, fileIds?: number[], rescan?: false }
  app.post('/start', async (c) => {
    if (verifyEmitter.running) {
      return c.json({ error: 'Verify already running' }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const concurrency = Math.max(1, Math.min(8, Number.parseInt(String(body.concurrency ?? 3), 10)));
    const fileIds = Array.isArray(body.fileIds) ? (body.fileIds as number[]) : undefined;
    const rescan = Boolean(body.rescan);
    const parsedBudget = Number.parseInt(String(body.budgetSeconds ?? 30), 10);
    const budgetSeconds = Number.isFinite(parsedBudget) ? Math.max(30, Math.min(3600, parsedBudget)) : 30;

    const signal = verifyEmitter.start();

    // Count how many we'll queue
    const queued = fileIds ? fileIds.length : db.getUnverifiedCount();

    verifyEmitter.emit('start', { concurrency, queued });

    setImmediate(async () => {
      try {
        await startVerifyQueue(db, { concurrency, fileIds, rescan, budgetSeconds, signal });
      } catch (err) {
        verifyEmitter.emit('error', { message: (err as Error).message });
      } finally {
        verifyEmitter.finish();
      }
    });

    return c.json({ started: true, queued });
  });

  // POST /api/verify/cancel
  app.post('/cancel', (c) => {
    const cancelled = verifyEmitter.cancel();
    return c.json({ cancelled });
  });

  // GET /api/verify/events  — SSE
  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'status',
        data: JSON.stringify({ running: verifyEmitter.running }),
      });

      const unsub = verifyEmitter.subscribe(async (ev) => {
        try {
          await stream.writeSSE({ event: ev.event, data: JSON.stringify(ev.data) });
        } catch {
          /* client disconnected */
        }
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

  // GET /api/verify/status
  app.get('/status', (c) => {
    const stats = db.getVerifyStats();
    return c.json({ running: verifyEmitter.running, ...stats });
  });

  // GET /api/verify/failures?page=1&limit=50
  app.get('/failures', (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;
    const failures = db.getFailedVerifyFiles(limit, offset);
    const total = db.getFailedVerifyCount();
    return c.json({ total, page, limit, failures });
  });

  // POST /api/verify/clear { fileIds?: number[] } — clear all verification state (pass/fail/error/pending)
  app.post('/clear', async (c) => {
    if (verifyEmitter.running) {
      return c.json({ error: 'Cannot clear verify errors while verify is running' }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.map((v) => Number.parseInt(String(v), 10)).filter((id) => Number.isInteger(id) && id > 0)
      : undefined;

    const result = db.clearVerifyErrors(fileIds);
    return c.json(result);
  });

  return app;
}
