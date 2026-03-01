/**
 * VerifyQueue — batch deep-verify of files.
 * Loads unverified files from DB, runs deepCheck concurrently,
 * emits progress via verifyEmitter, writes results back to DB.
 */

import type { CuratDb, FileRow } from '../db/client.js';
import { deepCheck } from './deepcheck.js';
import { verifyEmitter } from '../server/sse.js';

export interface VerifyOptions {
  concurrency?: number;   // default 3
  fileIds?: number[];     // if set, only verify these file IDs
  rescan?: boolean;       // re-verify already-verified files
  signal?: AbortSignal;
}

export async function startVerifyQueue(
  db: CuratDb,
  opts: VerifyOptions = {}
): Promise<void> {
  const concurrency = opts.concurrency ?? 3;
  const signal = opts.signal;

  let files: FileRow[];
  if (opts.fileIds && opts.fileIds.length > 0) {
    const all = db.getAllFiles();
    files = all.filter(f => opts.fileIds!.includes(f.id));
    if (!opts.rescan) {
      files = files.filter(f => f.verify_status == null || f.verify_status === 'pending');
    }
  } else {
    files = opts.rescan
      ? db.getAllFiles().filter(f => f.scanned_at != null && f.scan_error == null)
      : db.getUnverifiedFiles(10_000);
  }

  const total = files.length;
  let checked = 0;
  let passed = 0;
  let failed = 0;
  let errors = 0;

  verifyEmitter.emit('progress', { total, checked, passed, failed, errors, running: true });

  const queue = [...files];

  async function worker(): Promise<void> {
    while (queue.length > 0 && !signal?.aborted) {
      const file = queue.shift();
      if (!file) break;

      const result = await deepCheck(file.file_path, signal);
      if (signal?.aborted) break;

      const status = result.ok ? 'pass' : 'fail';
      if (result.ok) passed++;
      else if (result.errors.some(e => e.startsWith('spawn error') || e.startsWith('timeout'))) errors++;
      else failed++;

      checked++;
      db.setVerifyResult(file.id, {
        status: result.ok ? 'pass' : 'fail',
        errors: result.errors,
        qualityFlags: result.qualityFlags,
      });

      verifyEmitter.emit('file_result', {
        fileId: file.id,
        filePath: file.file_path,
        filename: file.filename,
        movieId: file.movie_id,
        ok: result.ok,
        errors: result.errors,
        durationMs: result.durationMs,
        status,
      });

      verifyEmitter.emit('progress', { total, checked, passed, failed, errors, running: true });
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, files.length || 1); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const cancelled = signal?.aborted ?? false;
  verifyEmitter.emit('complete', { total, checked, passed, failed, errors, cancelled });
}
