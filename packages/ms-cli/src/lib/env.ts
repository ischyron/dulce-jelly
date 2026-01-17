import * as fs from 'fs';
import * as path from 'path';

export interface EnvVars {
  [key: string]: string | undefined;
}

export function loadEnv(baseDir: string): EnvVars {
  const envPath = path.join(baseDir, '.env');
  const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf-8')) : {};
  return { ...fileEnv, ...process.env };
}

function stripQuotes(val: string): string {
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

function parseEnv(content: string): EnvVars {
  const out: EnvVars = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    out[key] = stripQuotes(val);
  });
  return out;
}

export function checkPath(p: string): string {
  try {
    fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK);
    return '[ok]';
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return '[missing]';
    return `[no-access: ${error.code || 'error'}]`;
  }
}
