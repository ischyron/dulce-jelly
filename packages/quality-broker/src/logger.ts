import fs from 'fs';
import path from 'path';

import { RunLogEntry, RunSummary } from './types.js';

export class RunLogger {
  private readonly logDir: string;
  private readonly statusDir: string;

  constructor(baseDir: string) {
    const repoRoot = path.resolve(baseDir, '..');
    this.logDir = path.join(repoRoot, 'data/quality-broker/logs');
    this.statusDir = path.join(repoRoot, 'data/quality-broker/status');
  }

  private ensureDirs() {
    fs.mkdirSync(this.logDir, { recursive: true });
    fs.mkdirSync(this.statusDir, { recursive: true });
  }

  writeLog(entries: RunLogEntry[]): string {
    this.ensureDirs();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.logDir, `${ts}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
    return filePath;
  }

  writeStatus(summary: RunSummary) {
    this.ensureDirs();
    const filePath = path.join(this.statusDir, 'last-run.json');
    fs.writeFileSync(filePath, JSON.stringify(summary, null, 2));
  }
}
