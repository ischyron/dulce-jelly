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
      seedDefaults(db);
      const app = createApp(db, distUiPath);

      serve({ fetch: app.fetch, port, hostname: host }, (info) => {
        console.log(`  Listening on http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}`);
        console.log('  Press Ctrl+C to stop\n');
      });

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        db.close();
        process.exit(0);
      });
    });
}

function defaultDbPath(): string {
  // Priority: CURATARR_DB env var → ~/.curatarr/curatarr.db
  // In Docker the image sets CURATARR_DB=/config/curatarr.db by default.
  return process.env.CURATARR_DB ?? path.join(os.homedir(), '.curatarr', 'curatarr.db');
}
