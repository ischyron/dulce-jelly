/**
 * Cache management commands
 */

import { Command } from 'commander';

import { loadConfig } from '../shared/config.js';

export function cacheCommand(baseDir: string): Command {
  const cmd = new Command('cache')
    .description('Manage search cache');

  cmd
    .command('stats')
    .description('Show cache statistics')
    .action(async () => {
      try {
        const config = loadConfig(baseDir);
        console.log(`Cache DB: ${config.cache.dbPath}`);
        console.log(`TTL: ${config.cache.searchTtlHours} hours`);
        console.log(`Max entries: ${config.cache.maxEntries}`);

        // TODO: Implement cache stats
        console.log('\n[Not implemented yet] Cache stats pending');

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  cmd
    .command('clear')
    .description('Clear the search cache')
    .option('--confirm', 'Confirm cache clear')
    .action(async (opts) => {
      try {
        if (!opts.confirm) {
          console.error('Error: --confirm flag is required to clear cache');
          process.exit(1);
        }

        const config = loadConfig(baseDir);
        console.log(`Clearing cache: ${config.cache.dbPath}`);

        // TODO: Implement cache clear
        console.log('\n[Not implemented yet] Cache clear pending');

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  cmd
    .command('sync')
    .description('Sync recent releases from indexer to cache')
    .option('--max-age-days <n>', 'Max age of releases to fetch', '7')
    .option('--force', 'Force re-fetch even if cached')
    .action(async (opts) => {
      try {
        const config = loadConfig(baseDir);
        console.log(`Syncing from: ${config.indexer.url}`);
        console.log(`Max age: ${opts.maxAgeDays} days`);

        // TODO: Implement sync
        console.log('\n[Not implemented yet] Cache sync pending');
        console.log('Will:');
        console.log('  1. Query indexer for recent releases');
        console.log('  2. Parse each release title');
        console.log('  3. Store in SQLite cache');
        console.log('  4. Evict stale entries');

      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
