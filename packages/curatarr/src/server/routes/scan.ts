import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { CuratDb } from '../../db/client.js';
import { scanLibrary } from '../../scanner/scan.js';
import { movieLibraryPaths, parseLibraryRootsJson } from '../../shared/libraryRoots.js';
import { scanEmitter } from '../sse.js';

export function makeScanRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/scan  { path?: string, jobs?: number, rescan?: boolean }
  app.post('/', async (c) => {
    if (scanEmitter.running) {
      return c.json({ error: 'Scan already running' }, 409);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedPath = typeof body.path === 'string' ? body.path : '';
    const jobs = Math.max(1, Number.parseInt(String(body.jobs ?? Math.floor(os.cpus().length / 2)), 10));
    const rescan = Boolean(body.rescan);

    const configuredRoots = parseLibraryRootsJson(db.getSetting('libraryRoots'));
    const configuredMoviePaths = movieLibraryPaths(configuredRoots);
    const libraryPaths = requestedPath
      ? [path.resolve(requestedPath.replace(/^~/, os.homedir()))]
      : configuredMoviePaths;

    if (libraryPaths.length === 0) {
      return c.json(
        {
          error: 'Library root folders not configured. Add Movies roots in Settings or provide a path in request body.',
        },
        400,
      );
    }

    for (const p of libraryPaths) {
      if (!fs.existsSync(p)) {
        return c.json({ error: `Library path does not exist: ${p}` }, 400);
      }
    }

    const signal = scanEmitter.start();

    scanEmitter.emit('start', { libraryPaths, jobs, rescan });

    setImmediate(async () => {
      try {
        const aggregate = {
          totalFolders: 0,
          totalFiles: 0,
          scannedOk: 0,
          scanErrors: 0,
          durationSec: 0,
          errors: [] as Array<{ file: string; error: string }>,
          cancelled: false,
          notes: '',
        };
        const startedAt = Date.now();

        for (let i = 0; i < libraryPaths.length; i++) {
          const libraryPath = libraryPaths[i];
          if (signal.aborted) {
            aggregate.cancelled = true;
            break;
          }

          scanEmitter.emit('root_start', { libraryPath, index: i + 1, total: libraryPaths.length });
          const result = await scanLibrary(libraryPath, db, {
            concurrency: jobs,
            rescan,
            signal,
            onProgress: (p) => {
              scanEmitter.emit('progress', {
                ...p,
                rootPath: libraryPath,
                rootIndex: i + 1,
                rootTotal: libraryPaths.length,
              });
            },
            onFolderComplete: (folderName, fileCount) => {
              scanEmitter.emit('folder_complete', {
                folderName,
                fileCount,
                rootPath: libraryPath,
                rootIndex: i + 1,
                rootTotal: libraryPaths.length,
              });
            },
          });
          aggregate.totalFolders += result.totalFolders;
          aggregate.totalFiles += result.totalFiles;
          aggregate.scannedOk += result.scannedOk;
          aggregate.scanErrors += result.scanErrors;
          aggregate.errors.push(...result.errors);
          scanEmitter.emit('root_complete', { libraryPath, index: i + 1, total: libraryPaths.length, result });
        }
        aggregate.durationSec = (Date.now() - startedAt) / 1000;
        aggregate.notes =
          libraryPaths.length > 1 ? `Scanned ${libraryPaths.length} movie roots` : `Scanned ${libraryPaths[0]}`;

        const result = aggregate;
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

    return c.json({ started: true, libraryPaths, jobs, rescan });
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

  // GET /api/scan/history
  app.get('/history', (c) => {
    const runs = db.getScanRuns(200);
    return c.json({ runs });
  });

  return app;
}
