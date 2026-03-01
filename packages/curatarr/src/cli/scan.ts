/**
 * curatarr scan <path>
 * Walk library root, ffprobe all video files, store in SQLite.
 */

import { Command } from 'commander';
import os from 'node:os';
import path from 'node:path';
import { CuratDb } from '../db/client.js';
import { scanLibrary } from '../scanner/scan.js';
import { countMovieFolders } from '../scanner/walker.js';

export function makeScanCommand(): Command {
  return new Command('scan')
    .description('Index a library root with ffprobe — store quality data in SQLite')
    .argument('<path>', 'Library root path (e.g. ~/Media/MEDIA1/Movies)')
    .option('-d, --db <path>', 'SQLite DB path', defaultDbPath())
    .option('-j, --jobs <n>', 'Concurrent ffprobe workers', String(defaultJobs()))
    .option('--rescan', 'Re-probe files already in DB (default: skip)')
    .option('--dry-run', 'Walk and count folders only — no ffprobe')
    .action(async (rawPath: string, opts) => {
      const libraryPath = path.resolve(rawPath.replace(/^~/, os.homedir()));
      const dbPath = opts.db.replace(/^~/, os.homedir());
      const jobs = parseInt(opts.jobs, 10);
      const rescan = Boolean(opts.rescan);
      const dryRun = Boolean(opts.dryRun);

      if (dryRun) {
        const count = countMovieFolders(libraryPath);
        console.log(`Dry run: found ${count} folders in ${libraryPath}`);
        return;
      }

      console.log(`\nScanning : ${libraryPath}`);
      console.log(`DB       : ${dbPath}`);
      console.log(`Workers  : ${jobs}`);
      console.log(`Rescan   : ${rescan}`);
      console.log('');

      const db = new CuratDb(dbPath);

      let lastPrint = 0;
      const result = await scanLibrary(libraryPath, db, {
        concurrency: jobs,
        rescan,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastPrint < 500) return; // throttle to 2Hz
          lastPrint = now;

          const pct = p.foldersTotal > 0
            ? Math.round(p.filesProcessed / (p.filesProcessed + Math.max(1, p.foldersTotal - p.foldersDone)) * 100)
            : 0;
          const eta = p.currentRate > 0
            ? Math.round((p.foldersTotal - p.foldersDone) / p.currentRate)
            : null;

          process.stdout.write(
            `\r  [${String(p.filesProcessed).padStart(5)}] ` +
            `${p.currentRate.toFixed(1)} f/s  ` +
            `ok=${p.filesOk}  err=${p.filesErrored}  ` +
            `${eta != null ? `ETA ~${eta}s` : ''}   `.padEnd(20)
          );
        },
      });

      process.stdout.write('\n');
      console.log('\n── Scan complete ────────────────────────────────────────');
      console.log(`  Folders  : ${result.totalFolders}`);
      console.log(`  Files    : ${result.totalFiles}`);
      console.log(`  OK       : ${result.scannedOk}`);
      console.log(`  Errors   : ${result.scanErrors}`);
      console.log(`  Duration : ${result.durationSec.toFixed(1)}s`);

      if (result.errors.length > 0) {
        console.log(`\n  First ${Math.min(10, result.errors.length)} errors:`);
        for (const e of result.errors.slice(0, 10)) {
          console.log(`    ${path.basename(e.file)}: ${e.error.slice(0, 80)}`);
        }
      }

      db.close();
    });
}

function defaultDbPath(): string {
  return path.join(os.homedir(), '.curatarr', 'curatarr.db');
}

function defaultJobs(): number {
  return Math.max(1, Math.floor(os.cpus().length / 2));
}
