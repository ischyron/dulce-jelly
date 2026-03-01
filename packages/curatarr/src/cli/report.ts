/**
 * curatarr report
 * Print quality analysis from the SQLite DB.
 */

import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { CuratDb } from '../db/client.js';
import {
  printStatus,
  printUpgradeCandidates,
  printSuspiciousFiles,
  printHdrBreakdown,
  printAudioBreakdown,
} from '../report/report.js';

export function makeReportCommand(): Command {
  return new Command('report')
    .description('Print library quality analysis from DB')
    .option('-d, --db <path>', 'SQLite DB path', defaultDbPath())
    .option('--upgrades', 'Show upgrade candidates (LQ groups + good ratings)')
    .option('--suspicious', 'Show files with suspicious size vs quality claims')
    .option('--hdr', 'Show HDR format breakdown')
    .option('--audio', 'Show audio codec breakdown')
    .option('--all', 'Show all sections')
    .option('--min-mc <n>', 'Min Metacritic rating for upgrade candidates', '70')
    .option('--min-imdb <n>', 'Min IMDb rating for upgrade candidates', '7.0')
    .option('--no-rating-filter', 'Show LQ upgrade candidates without requiring Jellyfin ratings')
    .option('--limit <n>', 'Max rows per section', '50')
    .action((opts) => {
      const dbPath = opts.db.replace(/^~/, os.homedir());
      const db = new CuratDb(dbPath);

      const showAll = Boolean(opts.all);
      const minMc = parseFloat(opts.minMc);
      const minImdb = parseFloat(opts.minImdb);
      const limit = parseInt(opts.limit, 10);

      // Always show status
      printStatus(db);

      if (showAll || opts.upgrades) {
        printUpgradeCandidates(db, {
          minCriticRating: minMc,
          minCommunityRating: minImdb,
          limit,
          lqGroupsOnly: true,
          skipRatingFilter: opts.ratingFilter === false,
        });
      }

      if (showAll || opts.suspicious) {
        printSuspiciousFiles(db, limit);
      }

      if (showAll || opts.hdr) {
        printHdrBreakdown(db);
      }

      if (showAll || opts.audio) {
        printAudioBreakdown(db);
      }

      if (!showAll && !opts.upgrades && !opts.suspicious && !opts.hdr && !opts.audio) {
        console.log('Tip: use --all, --upgrades, --suspicious, --hdr, or --audio for detailed sections.');
      }

      db.close();
    });
}

function defaultDbPath(): string {
  return path.join(os.homedir(), '.curatarr', 'curatarr.db');
}
