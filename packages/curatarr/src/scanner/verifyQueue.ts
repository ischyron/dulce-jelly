/**
 * VerifyQueue — batch deep-verify of files.
 * Loads unverified files from DB, runs deepCheck concurrently,
 * emits progress via verifyEmitter, writes results back to DB.
 */

import type { CuratDb, FileRow } from '../db/client.js';
import { verifyEmitter } from '../server/sse.js';
import { deepCheck } from './deepcheck.js';

export interface VerifyOptions {
  concurrency?: number; // default 3
  fileIds?: number[]; // if set, only verify these file IDs
  rescan?: boolean; // re-verify already-verified files
  signal?: AbortSignal;
}

export async function startVerifyQueue(db: CuratDb, opts: VerifyOptions = {}): Promise<void> {
  const concurrency = opts.concurrency ?? 3;
  const signal = opts.signal;
  const CHUNK_SIZE = 200;
  db.resetPendingVerifyStatuses();

  let total = 0;
  let checked = 0;
  let passed = 0;
  let failed = 0;
  let errors = 0;

  const queue: FileRow[] = [];
  const refill = () => {
    if ((opts.fileIds && opts.fileIds.length > 0) || signal?.aborted) return 0;
    const batch = db.pickFilesForVerify(CHUNK_SIZE, Boolean(opts.rescan));
    if (batch.length) {
      total += batch.length;
      queue.push(...batch);
    }
    return batch.length;
  };

  if (opts.fileIds && opts.fileIds.length > 0) {
    const reserved = db.reserveVerifyFilesById(opts.fileIds);
    total += reserved.length;
    queue.push(...reserved);
  } else {
    total += refill();
  }

  verifyEmitter.emit('progress', { total, checked, passed, failed, errors, running: true });

  async function worker(): Promise<void> {
    while (!signal?.aborted) {
      if (queue.length === 0) {
        if (refill() === 0) break;
        if (queue.length === 0) break;
      }
      const file = queue.shift();
      if (!file) continue;

      verifyEmitter.emit('file_start', {
        fileId: file.id,
        filePath: file.file_path,
        filename: file.filename,
        movieId: file.movie_id,
        startedAt: new Date().toISOString(),
      });

      const result = await deepCheck(file.file_path, signal);
      if (signal?.aborted) break;

      const status = result.ok ? 'pass' : 'fail';
      if (result.ok) passed++;
      else if (result.errors.some((e) => e.startsWith('spawn error') || e.startsWith('timeout'))) errors++;
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
  for (let i = 0; i < Math.max(concurrency, 1); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const cancelled = signal?.aborted ?? false;
  verifyEmitter.emit('complete', { total, checked, passed, failed, errors, cancelled });
}
