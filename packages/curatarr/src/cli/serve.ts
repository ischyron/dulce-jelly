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
import { JellyfinClient } from '../integrations/jellyfin/client.js';
import { syncJellyfin } from '../integrations/jellyfin/sync.js';
import { syncEmitter } from '../server/sse.js';
import { runScoutAutoBatch } from '../server/routes/scout.js';
import { applyRuntimeSettingsToDb, ensureRuntimePaths, loadRuntimeConfig } from '../shared/runtimeConfig.js';
import { getScoutDefaultSettings } from '../shared/scoutDefaults.js';

export function makeServeCommand(): Command {
  const runtimeCfg = loadRuntimeConfig();
  return new Command('serve')
    .description('Start the Curatarr web UI server')
    .option('-p, --port <n>', 'HTTP port', String(runtimeCfg.port))
    .option('-d, --db <path>', 'SQLite DB path', runtimeCfg.dbPath)
    .option('--host <host>', 'Bind host', runtimeCfg.host)
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      const dbPath = opts.db.replace(/^~/, os.homedir());
      const host = opts.host;
      ensureRuntimePaths(runtimeCfg);

      // UI build output lives under src/ui/dist.
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Resolve from repo/app root to avoid coupling to backend outDir location.
      const appRoot = path.resolve(__dirname, '../../../..');
      const distUiPath = path.resolve(appRoot, 'src/ui/dist');

      console.log(`\nCuratarr Web UI`);
      console.log(`  DB    : ${dbPath}`);
      console.log(`  UI    : ${distUiPath}`);
      console.log(`  Port  : ${port}`);
      console.log('');

      const db = new CuratDb(dbPath);
      const yamlMasterSettings: Record<string, string> = {
        ...runtimeCfg.settings,
        ...getScoutDefaultSettings(),
      };
      const syncStats = applyRuntimeSettingsToDb(
        (k) => db.getSetting(k),
        (k, v) => db.setSetting(k, v),
        yamlMasterSettings,
      );
      if (syncStats.total > 0) {
        console.log(
          `  Config : ${runtimeCfg.configPath} (${syncStats.changed}/${syncStats.total} settings synced from YAML)`,
        );
      }

      seedDefaults(db);
      const app = createApp(db, distUiPath);

      serve({ fetch: app.fetch, port, hostname: host }, (info) => {
        console.log(`  Listening on http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}`);
        console.log('  Press Ctrl+C to stop\n');
        // Start JF sync scheduler after server is up
        startJfSyncScheduler(db);
        startScoutScheduler(db);
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

    const url = db.getSetting('jellyfinUrl') ?? '';
    const apiKey = db.getSetting('jellyfinApiKey') ?? '';
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

function startScoutScheduler(db: CuratDb): void {
  const enabled = (db.getSetting('scoutAutoEnabled') ?? 'false').toLowerCase();
  if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
    console.log('  Scout   : Auto-scout disabled');
    return;
  }

  const intervalRaw = parseInt(db.getSetting('scoutAutoIntervalMin') ?? '60', 10);
  const intervalMin = Number.isFinite(intervalRaw) ? Math.max(5, Math.min(24 * 60, intervalRaw)) : 60;
  const intervalMs = intervalMin * 60 * 1000;
  console.log(`  Scout   : Auto-scout every ${intervalMin} min`);

  const runScheduledScout = async () => {
    try {
      const summary = await runScoutAutoBatch(db, 'scheduled');
      const errors = summary.results.filter(r => r.error).length;
      console.log(
        `  [Scout] Auto batch done — ${summary.processed}/${summary.maxAllowed} processed` +
        `${summary.skippedByCooldown ? `, ${summary.skippedByCooldown} cooldown-skipped` : ''}` +
        `${errors ? `, ${errors} errors` : ''}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'prowlarr_not_configured') {
        console.log('  [Scout] Skipped — Prowlarr not configured');
        return;
      }
      if (msg === 'auto_scout_already_running') return;
      console.error(`  [Scout] Error: ${msg}`);
    }
  };

  setInterval(runScheduledScout, intervalMs);
}
