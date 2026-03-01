#!/usr/bin/env node
/**
 * Curatarr CLI entry point
 */

import { Command } from 'commander';
import { makeScanCommand } from './cli/scan.js';
import { makeJfSyncCommand } from './cli/jf-sync.js';
import { makeReportCommand } from './cli/report.js';
import { makeServeCommand } from './cli/serve.js';

const program = new Command('curatarr')
  .description('Media library quality indexer — ffprobe + Jellyfin + SQLite')
  .version('0.2.0');

program.addCommand(makeScanCommand());
program.addCommand(makeJfSyncCommand());
program.addCommand(makeReportCommand());
program.addCommand(makeServeCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
