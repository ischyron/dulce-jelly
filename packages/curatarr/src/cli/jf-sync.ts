/**
 * curatarr jf-sync
 * Read Jellyfin metadata and enrich SQLite movie rows.
 */

import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { CuratDb } from '../db/client.js';
import { JellyfinClient } from '../jellyfin/client.js';
import { syncJellyfin } from '../jellyfin/sync.js';

export function makeJfSyncCommand(): Command {
  return new Command('jf-sync')
    .description('Enrich library DB with Jellyfin metadata (ratings, IDs, genres)')
    .option('-d, --db <path>', 'SQLite DB path', defaultDbPath())
    .option('--url <url>', 'Jellyfin URL (overrides JELLYFIN_URL env)')
    .option('--api-key <key>', 'Jellyfin API key (overrides JELLYFIN_API_KEY env)')
    .option('--resync', 'Re-sync movies already enriched')
    .option('--show-unmatched', 'Print titles that could not be matched')
    .action(async (opts) => {
      const dbPath = opts.db.replace(/^~/, os.homedir());

      // Env var setup — option overrides env
      if (opts.url) process.env.JELLYFIN_URL = opts.url;
      if (opts.apiKey) process.env.JELLYFIN_API_KEY = opts.apiKey;

      if (!JellyfinClient.isConfigured()) {
        console.error(
          'Jellyfin not configured.\n' +
          'Set JELLYFIN_URL and JELLYFIN_API_KEY env vars, or pass --url / --api-key.'
        );
        process.exit(1);
      }

      const db = new CuratDb(dbPath);
      const jfClient = new JellyfinClient();

      console.log(`\nJF sync`);
      console.log(`  DB   : ${dbPath}`);
      console.log(`  JF   : ${process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL}`);
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

function defaultDbPath(): string {
  return path.join(os.homedir(), '.curatarr', 'curatarr.db');
}
