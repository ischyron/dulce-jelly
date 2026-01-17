import { spawnSync } from 'child_process';
import * as path from 'path';

const baseDir = path.join(__dirname, '..', '..', '..');

export interface CommandResult {
  code: number;
  stdout: string;
}

export interface RunOptions {
  capture?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function runCompose(args: string[], opts: RunOptions = {}): number | CommandResult {
  const { capture = false, cwd = baseDir, env } = opts;
  const res = spawnSync('docker', ['compose', ...args], {
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8',
    env: env || process.env
  });
  if (capture) {
    return { code: res.status || 0, stdout: res.stdout || '' };
  }
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
  return res.status || 0;
}

export function runCommand(cmd: string, args: string[], opts: RunOptions = {}): number | CommandResult {
  const res = spawnSync(cmd, args, {
    ...opts,
    stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8'
  });
  if (opts.capture) {
    return { code: res.status || 0, stdout: res.stdout || '' };
  }
  return res.status || 0;
}
