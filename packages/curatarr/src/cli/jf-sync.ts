/**
 * curatarr jf-sync
 * Read Jellyfin metadata and enrich SQLite movie rows.
 */

import { Command } from 'commander';
import os from 'node:os';
import { CuratDb } from '../db/client.js';
import { JellyfinClient } from '../integrations/jellyfin/client.js';
import { syncJellyfin } from '../integrations/jellyfin/sync.js';
import { loadRuntimeConfig } from '../shared/runtimeConfig.js';

export function makeJfSyncCommand(): Command {
  const runtimeCfg = loadRuntimeConfig();
  return new Command('jf-sync')
    .description('Enrich library DB with Jellyfin metadata (ratings, IDs, genres)')
    .option('-d, --db <path>', 'SQLite DB path', runtimeCfg.dbPath)
    .option('--url <url>', 'Jellyfin URL (overrides config settings)')
    .option('--api-key <key>', 'Jellyfin API key (overrides config settings)')
    .option('--resync', 'Re-sync movies already enriched')
    .option('--show-unmatched', 'Print titles that could not be matched')
    .action(async (opts) => {
      const dbPath = opts.db.replace(/^~/, os.homedir());

      const db = new CuratDb(dbPath);
      const url = opts.url || runtimeCfg.settings.jellyfinUrl || db.getSetting('jellyfinUrl') || '';
      const apiKey = opts.apiKey || runtimeCfg.settings.jellyfinApiKey || db.getSetting('jellyfinApiKey') || '';
      if (!url || !apiKey) {
        console.error(
          'Jellyfin not configured.\n' +
          'Set settings.jellyfinUrl and settings.jellyfinApiKey in config/config.yaml, or pass --url / --api-key.'
        );
        process.exit(1);
      }
      const jfClient = new JellyfinClient(url, apiKey);

      console.log(`\nJF sync`);
      console.log(`  DB   : ${dbPath}`);
      console.log(`  JF   : ${url}`);
      console.log('');

      let lastPrint = 0;
      const result = await syncJellyfin(jfClient, db, {
        resync: Boolean(opts.resync),
        onProgress: (synced, total, matched, unmatched) => {
          const now = Date.now();
          if (now - lastPrint < 500) return;
          lastPrint = now;
          process.stdout.write(
            `\r  ${synced}/${total}  matched=${matched}  unmatched=${unmatched}   `
          );
        },
      });

      process.stdout.write('\n');
      console.log('\n── JF sync complete ─────────────────────────────────────');
      console.log(`  JF movies    : ${result.total}`);
      console.log(`  Matched      : ${result.matched}`);
      console.log(`  Unmatched    : ${result.unmatched}`);
      console.log(`  Errors       : ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\n  Errors:');
        for (const e of result.errors.slice(0, 10)) console.log(`    ${e}`);
      }

      if (opts.showUnmatched && result.unmatchedJfTitles.length > 0) {
        console.log(`\n  Unmatched JF titles (${result.unmatchedJfTitles.length}):`);
        for (const t of result.unmatchedJfTitles.slice(0, 30)) {
          console.log(`    ${t}`);
        }
        if (result.unmatchedJfTitles.length > 30) {
          console.log(`    ... and ${result.unmatchedJfTitles.length - 30} more`);
        }
      }

      db.close();
    });
}
