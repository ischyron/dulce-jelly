/**
 * Scan orchestrator
 * Walk library → ffprobe each file → upsert SQLite
 * Concurrent ffprobe with configurable worker pool.
 */

import path from 'node:path';
import os from 'node:os';
import { walkLibrary } from './walker.js';
import { probeFile, probeToUpsert } from './ffprobe.js';
import type { CuratDb } from '../db/client.js';

export interface ScanOptions {
  /** Number of concurrent ffprobe processes. Default: half CPU cores. */
  concurrency?: number;
  /** Callback fired after each file is processed. */
  onProgress?: (progress: ScanProgress) => void;
  /** Callback fired when all files in a folder finish processing. */
  onFolderComplete?: (folderName: string, fileCount: number) => void;
  /** If true, re-scan files already in DB (force refresh). Default: false. */
  rescan?: boolean;
  /** Skip files larger than this in bytes. Default: no limit. */
  maxFileSizeBytes?: number;
  /** Abort signal to cancel the scan. */
  signal?: AbortSignal;
}

export interface ScanProgress {
  folder: string;
  file: string;
  foldersDone: number;
  foldersTotal: number;
  filesProcessed: number;
  filesOk: number;
  filesErrored: number;
  currentRate: number;   // files/sec (rolling)
  elapsedSec: number;
  cancelled?: boolean;
}

export interface ScanResult {
  rootPath: string;
  totalFolders: number;
  totalFiles: number;
  scannedOk: number;
  scanErrors: number;
  durationSec: number;
  errors: Array<{ file: string; error: string }>;
}

// ──────────────────────────────────────────────────────────────────
// Concurrency pool — run up to N async tasks simultaneously
// ──────────────────────────────────────────────────────────────────

async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const myIdx = idx++;
      results[myIdx] = await tasks[myIdx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ──────────────────────────────────────────────────────────────────
// Main scan function
// ──────────────────────────────────────────────────────────────────

export async function scanLibrary(
  rootPath: string,
  db: CuratDb,
  opts: ScanOptions = {}
): Promise<ScanResult> {
  const concurrency = opts.concurrency ?? Math.max(1, Math.floor(os.cpus().length / 2));
  const rescan = opts.rescan ?? false;

  const startTime = Date.now();
  const runId = db.startScanRun(rootPath);

  const result: ScanResult = {
    rootPath,
    totalFolders: 0,
    totalFiles: 0,
    scannedOk: 0,
    scanErrors: 0,
    durationSec: 0,
    errors: [],
  };

  // ── Collect all work items first (fast — no I/O per file yet) ──
  interface WorkItem {
    folderPath: string;
    folderName: string;
    parsedTitle: string;
    parsedYear: number | undefined;
    movieId?: number;           // filled after upsert
    filePath: string;
    filename: string;
    alreadyScanned: boolean;
  }

  const workItems: WorkItem[] = [];
  // Track file counts per folder for onFolderComplete
  const folderFileCounts = new Map<string, number>();
  const folderFileDone = new Map<string, number>();

  for (const folder of walkLibrary(rootPath)) {
    result.totalFolders++;

    // Upsert movie folder record immediately (synchronous, fast)
    const movieId = db.upsertMovie({
      folderPath: folder.folderPath,
      folderName: folder.folderName,
      parsedTitle: folder.parsedTitle,
      parsedYear: folder.parsedYear,
    });

    for (const filePath of folder.videoFiles) {
      result.totalFiles++;
      const filename = path.basename(filePath);

      // Check if already scanned
      const existingFiles = db.getFilesForMovie(movieId);
      const existing = existingFiles.find(f => f.file_path === filePath);
      const alreadyScanned = !!(existing?.scanned_at && !rescan);

      if (alreadyScanned) {
        // Still count it as ok
        result.scannedOk++;
        continue;
      }

      workItems.push({
        folderPath: folder.folderPath,
        folderName: folder.folderName,
        parsedTitle: folder.parsedTitle,
        parsedYear: folder.parsedYear,
        movieId,
        filePath,
        filename,
        alreadyScanned: false,
      });
      folderFileCounts.set(folder.folderPath, (folderFileCounts.get(folder.folderPath) ?? 0) + 1);
    }
  }

  if (workItems.length === 0) {
    const durationSec = (Date.now() - startTime) / 1000;
    result.durationSec = durationSec;
    db.finishScanRun(runId, { ...result, durationSec, notes: 'All files already scanned' });
    return result;
  }

  // ── Process with concurrency pool ─────────────────────────────
  let filesProcessed = 0;
  const rateWindow: number[] = []; // timestamps for rolling rate

  const tasks = workItems.map(item => async () => {
    // Check cancellation before each file
    if (opts.signal?.aborted) return;
    if (!item.movieId) return;

    // Size check
    if (opts.maxFileSizeBytes) {
      try {
        const { statSync } = await import('node:fs');
        const stat = statSync(item.filePath);
        if (stat.size > opts.maxFileSizeBytes) {
          db.upsertFile({
            movieId: item.movieId,
            filePath: item.filePath,
            filename: item.filename,
            scanError: `File too large: ${(stat.size / 1e9).toFixed(1)} GB`,
          });
          result.scanErrors++;
          result.errors.push({ file: item.filePath, error: 'File too large' });
          return;
        }
      } catch { /* stat failed — proceed anyway */ }
    }

    const probeResult = await probeFile(item.filePath);

    if ('error' in probeResult) {
      db.upsertFile({
        movieId: item.movieId,
        filePath: item.filePath,
        filename: item.filename,
        scanError: probeResult.error,
      });
      result.scanErrors++;
      result.errors.push({ file: item.filePath, error: probeResult.error });
    } else {
      const upsertData = probeToUpsert(probeResult, item.movieId, item.filePath, item.filename);
      db.upsertFile(upsertData);
      result.scannedOk++;
    }

    filesProcessed++;
    rateWindow.push(Date.now());
    // Keep a 30-second window for rate calculation
    const cutoff = Date.now() - 30_000;
    while (rateWindow.length > 0 && rateWindow[0] < cutoff) rateWindow.shift();
    const currentRate = rateWindow.length / 30;

    // Track folder completion
    const done = (folderFileDone.get(item.folderPath) ?? 0) + 1;
    folderFileDone.set(item.folderPath, done);
    const total = folderFileCounts.get(item.folderPath) ?? 0;
    if (done >= total && opts.onFolderComplete) {
      opts.onFolderComplete(item.folderName, done);
    }

    if (opts.onProgress) {
      opts.onProgress({
        folder: item.folderName,
        file: item.filename,
        foldersDone: folderFileDone.size,
        foldersTotal: result.totalFolders,
        filesProcessed,
        filesOk: result.scannedOk,
        filesErrored: result.scanErrors,
        currentRate,
        elapsedSec: (Date.now() - startTime) / 1000,
        cancelled: opts.signal?.aborted,
      });
    }
  });

  await runPool(tasks, concurrency);

  result.durationSec = (Date.now() - startTime) / 1000;

  db.finishScanRun(runId, {
    totalFolders: result.totalFolders,
    totalFiles: result.totalFiles,
    scannedOk: result.scannedOk,
    scanErrors: result.scanErrors,
    durationSec: result.durationSec,
    notes: result.errors.length > 0 ? `${result.errors.length} errors` : undefined,
  });

  return result;
}
