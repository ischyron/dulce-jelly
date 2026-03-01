/**
 * AsyncDisambiguationQueue — processes batches concurrently,
 * emits results via SSE, persists to DB.
 */

import type { CuratDb } from '../db/client.js';
import type { DisambiguateRequest, DisambiguateResult } from './types.js';
import { DisambiguationEngine } from './engine.js';
import { disEmitter } from '../server/sse.js';

export interface QueueOptions {
  concurrency?: number;  // default 4
  signal?: AbortSignal;
}

export async function runDisambiguationQueue(
  jobId: string,
  reqs: DisambiguateRequest[],
  db: CuratDb,
  opts: QueueOptions = {}
): Promise<{ total: number; ambiguous: number }> {
  const concurrency = opts.concurrency ?? 4;
  const signal = opts.signal;
  const dbMovies = db.getAllMovies();
  const engine = new DisambiguationEngine(dbMovies);

  let total = 0;
  let ambiguous = 0;
  const queue = [...reqs];

  async function processOne(req: DisambiguateRequest): Promise<void> {
    if (signal?.aborted) return;
    const result = engine.disambiguate(req);
    db.logDisambiguationResultFull(result, jobId, req.title, req.year);
    if (result.ambiguous) ambiguous++;
    total++;
    disEmitter.emit('result', result);
  }

  // Process with concurrency limit using a pool
  const workers: Promise<void>[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0 && !signal?.aborted) {
      const req = queue.shift();
      if (req) await processOne(req);
    }
  }

  for (let i = 0; i < Math.min(concurrency, reqs.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  disEmitter.emit('complete', { jobId, total, ambiguous });
  return { total, ambiguous };
}
