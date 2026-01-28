#!/usr/bin/env node
/**
 * Curatarr - LLM-backed intelligent media library management
 *
 * Replaces: Radarr, Sonarr, Prowlarr, Recyclarr
 * Keeps: Jellyfin (library/player), SABnzbd (downloads)
 */

import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { scanCommand } from './cli/scan.js';
import { searchCommand } from './cli/search.js';
import { grabCommand } from './cli/grab.js';
import { cacheCommand } from './cli/cache.js';
import { monitorCommand } from './cli/monitor.js';

const baseDir = fileURLToPath(new URL('..', import.meta.url));

const program = new Command();

program
  .name('curatarr')
  .description('LLM-backed intelligent media library management')
  .version('0.1.0');

// Register subcommands
program.addCommand(scanCommand(baseDir));
program.addCommand(searchCommand(baseDir));
program.addCommand(grabCommand(baseDir));
program.addCommand(cacheCommand(baseDir));
program.addCommand(monitorCommand(baseDir));

program.parseAsync(process.argv);
