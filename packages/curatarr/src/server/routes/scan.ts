import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import os from 'node:os';
import path from 'node:path';
import type { CuratDb } from '../../db/client.js';
import { scanEmitter } from '../sse.js';
import { scanLibrary } from '../../scanner/scan.js';

export function makeScanRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/scan  { path?: string, jobs?: number, rescan?: boolean }
  app.post('/', async (c) => {
    if (scanEmitter.running) {
      return c.json({ error: 'Scan already running' }, 409);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const rawPath = (body.path as string) ?? db.getSetting('libraryPath') ?? '';
    const jobs = Math.max(1, parseInt(String(body.jobs ?? Math.floor(os.cpus().length / 2)), 10));
    const rescan = Boolean(body.rescan);

    if (!rawPath) {
      return c.json({ error: 'Library path not configured. Set in Settings or provide path in request body.' }, 400);
    }

    const libraryPath = path.resolve(rawPath.replace(/^~/, os.homedir()));
    const signal = scanEmitter.start();

    scanEmitter.emit('start', { libraryPath, jobs, rescan });

    setImmediate(async () => {
      try {
        const result = await scanLibrary(libraryPath, db, {
          concurrency: jobs,
          rescan,
          signal,
          onProgress: (p) => {
            scanEmitter.emit('progress', p);
          },
          onFolderComplete: (folderName, fileCount) => {
            scanEmitter.emit('folder_complete', { folderName, fileCount });
          },
        });
        if (signal.aborted) {
          scanEmitter.emit('complete', { ...result, cancelled: true });
        } else {
          scanEmitter.emit('complete', result);
        }
      } catch (err) {
        scanEmitter.emit('error', { message: (err as Error).message });
      } finally {
        scanEmitter.finish();
      }
    });

    return c.json({ started: true, libraryPath, jobs, rescan });
  });

  // POST /api/scan/cancel
  app.post('/cancel', (c) => {
    const cancelled = scanEmitter.cancel();
    return c.json({ cancelled });
  });

  // GET /api/scan/status
  app.get('/status', (c) => {
    return c.json({ running: scanEmitter.running });
  });

  // GET /api/scan/events  — SSE stream
  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'status',
        data: JSON.stringify({ running: scanEmitter.running }),
      });

      const unsub = scanEmitter.subscribe(async (ev) => {
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

  // GET /api/scan/history
  app.get('/history', (c) => {
    const runs = db.getScanRuns(20);
    return c.json({ runs });
  });

  return app;
}
