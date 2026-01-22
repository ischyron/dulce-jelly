import fs from 'fs';
import path from 'path';

import { RunLogEntry, RunSummary } from './types.js';

export class RunLogger {
  private readonly logDir: string;
  private readonly statusDir: string;
  private logPath?: string;
  private lastFlushedCount = 0;
  private lastFlushedAt = 0;
  private readonly flushEvery: number;
  private readonly flushIntervalMs: number;

  constructor(baseDir: string, opts?: { flushEvery?: number; flushIntervalMs?: number }) {
    const repoRoot = path.resolve(baseDir, '..');
    this.logDir = path.join(repoRoot, 'data/quality-broker/logs');
    this.statusDir = path.join(repoRoot, 'data/quality-broker/status');
    const envFlushEvery = Number(process.env.QUALITY_BROKER_LOG_FLUSH_EVERY);
    const envFlushInterval = Number(process.env.QUALITY_BROKER_LOG_FLUSH_INTERVAL_MS);
    this.flushEvery = opts?.flushEvery ?? (Number.isFinite(envFlushEvery) && envFlushEvery > 0 ? envFlushEvery : 10);
    this.flushIntervalMs =
      opts?.flushIntervalMs ?? (Number.isFinite(envFlushInterval) && envFlushInterval > 0 ? envFlushInterval : 15000);
  }

  private ensureDirs() {
    fs.mkdirSync(this.logDir, { recursive: true });
    fs.mkdirSync(this.statusDir, { recursive: true });
  }

  initLog(): string {
    if (this.logPath) return this.logPath;
    this.ensureDirs();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.logPath = path.join(this.logDir, `${ts}.json`);
    this.writeLogAtomic([]);
    return this.logPath;
  }

  private writeLogAtomic(entries: RunLogEntry[]): string {
    this.ensureDirs();
    const filePath = this.logPath ?? this.initLog();
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
    fs.renameSync(tmpPath, filePath);
    this.lastFlushedCount = entries.length;
    this.lastFlushedAt = Date.now();
    return filePath;
  }

  checkpoint(entries: RunLogEntry[], force: boolean = false): string {
    const filePath = this.logPath ?? this.initLog();
    if (force) return this.writeLogAtomic(entries);
    const entriesSince = entries.length - this.lastFlushedCount;
    const timeSince = Date.now() - this.lastFlushedAt;
    if (entriesSince >= this.flushEvery || timeSince >= this.flushIntervalMs) {
      return this.writeLogAtomic(entries);
    }
    return filePath;
  }

  writeLog(entries: RunLogEntry[]): string {
    return this.writeLogAtomic(entries);
  }

  writeStatus(summary: RunSummary) {
    this.ensureDirs();
    const filePath = path.join(this.statusDir, 'last-run.json');
    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  }
}
