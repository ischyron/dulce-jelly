/**
 * curatarr serve [--port 7474] [--db ~/.curatarr/curatarr.db]
 * Starts the Hono HTTP server serving the API + React SPA.
 */

import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { CuratDb } from '../db/client.js';
import { createApp } from '../server/app.js';
import { seedDefaults } from '../db/seeds.js';
import { readEnvFile, findCuratarrEnv, ENV_TO_SETTING } from '../shared/envFile.js';
import { JellyfinClient } from '../jellyfin/client.js';
import { syncJellyfin } from '../jellyfin/sync.js';
import { syncEmitter } from '../server/sse.js';

export function makeServeCommand(): Command {
  return new Command('serve')
    .description('Start the Curatarr web UI server')
    .option('-p, --port <n>', 'HTTP port', process.env.CURATARR_PORT ?? '7474')
    .option('-d, --db <path>', 'SQLite DB path', defaultDbPath())
    .option('--host <host>', 'Bind host', process.env.CURATARR_HOST ?? '0.0.0.0')
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const dbPath = opts.db.replace(/^~/, os.homedir());
      const host = opts.host;

      // dist-ui is next to dist/ — both are siblings of src/
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // __dirname = packages/curatarr/dist/cli/
      const distUiPath = path.resolve(__dirname, '../../dist-ui');

      console.log(`\nCuratarr Web UI`);
      console.log(`  DB    : ${dbPath}`);
      console.log(`  UI    : ${distUiPath}`);
      console.log(`  Port  : ${port}`);
      console.log('');

      const db = new CuratDb(dbPath);

      // Load settings from packages/curatarr/.env (or cwd/.env) — overrides DB on every start.
      // This is the primary config source; edit the .env file, restart to apply.
      const envFilePath = findCuratarrEnv(__dirname);
      if (envFilePath) {
        const envVars = readEnvFile(envFilePath);
        let loaded = 0;
        for (const [envKey, dbKey] of Object.entries(ENV_TO_SETTING)) {
          if (envVars[envKey]) {
            db.setSetting(dbKey, envVars[envKey]);
            loaded++;
          }
        }
        if (loaded > 0) console.log(`  Config : ${envFilePath} (${loaded} setting${loaded > 1 ? 's' : ''} applied)`);
      }

      seedDefaults(db);
      const app = createApp(db, distUiPath);

      serve({ fetch: app.fetch, port, hostname: host }, (info) => {
        console.log(`  Listening on http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}`);
        console.log('  Press Ctrl+C to stop\n');
        // Start JF sync scheduler after server is up
        startJfSyncScheduler(db);
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        db.close();
        process.exit(0);
      });
    });
}

function startJfSyncScheduler(db: CuratDb): void {
  const intervalMin = parseInt(db.getSetting('jfSyncIntervalMin') ?? '30', 10);
  if (isNaN(intervalMin) || intervalMin <= 0) {
    console.log('  JF Sync : Auto-sync disabled (interval = 0)');
    return;
  }

  const intervalMs = intervalMin * 60 * 1000;
  console.log(`  JF Sync : Auto-sync every ${intervalMin} min`);

  const runScheduledSync = async () => {
    if (syncEmitter.running) return; // skip — manual or scheduled sync already in progress

    const url = db.getSetting('jellyfinUrl') ?? process.env.JELLYFIN_URL ?? '';
    const apiKey = db.getSetting('jellyfinApiKey') ?? process.env.JELLYFIN_API_KEY ?? '';
    if (!url || !apiKey) return; // JF not configured yet

    const batchSize = parseInt(db.getSetting('jfSyncBatchSize') ?? '10', 10);
    console.log(`  [JF Sync] Scheduled sync (batch: ${batchSize})`);

    const signal = syncEmitter.start();
    syncEmitter.emit('start', { url, resync: false, scheduled: true });

    try {
      const jfClient = new JellyfinClient(url, apiKey);
      const result = await syncJellyfin(jfClient, db, {
        resync: false,
        batchSize,
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
        console.log(`  [JF Sync] Done — ${result.matched} matched, ${result.unmatched} unmatched`);
      }
    } catch (err) {
      syncEmitter.emit('error', { message: (err as Error).message });
      console.error(`  [JF Sync] Error: ${(err as Error).message}`);
    } finally {
      syncEmitter.finish();
    }
  };

  setInterval(runScheduledSync, intervalMs);
}

function defaultDbPath(): string {
  // Priority: CURATARR_DB env var → ~/.curatarr/curatarr.db
  // In Docker the image sets CURATARR_DB=/config/curatarr.db by default.
  return process.env.CURATARR_DB ?? path.join(os.homedir(), '.curatarr', 'curatarr.db');
}
