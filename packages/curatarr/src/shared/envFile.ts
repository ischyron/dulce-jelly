/**
 * Minimal .env file loader.
 * Reads KEY=VALUE pairs (skips blank lines and # comments).
 * Does NOT modify process.env — returns a plain Record.
 */

import fs from 'node:fs';
import path from 'node:path';

export function readEnvFile(filePath: string): Record<string, string> {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) result[key] = val;
  }
  return result;
}

/**
 * Find the curatarr .env file.
 * Looks in process.cwd() first, then the directory of the running script.
 */
export function findCuratarrEnv(scriptDir: string): string | null {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(scriptDir, '..', '..', '.env'), // dist/cli/ → packages/curatarr/
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Maps .env keys → DB setting keys.
 * Extend as new settings are added.
 */
export const ENV_TO_SETTING: Record<string, string> = {
  JELLYFIN_URL:     'jellyfinUrl',
  JELLYFIN_BASE_URL:'jellyfinUrl',
  JELLYFIN_PUBLIC_URL:'jellyfinPublicUrl',
  JELLYFIN_API_KEY: 'jellyfinApiKey',
  LIBRARY_PATH:     'libraryPath',
  LLM_PROVIDER:     'llmProvider',
  LLM_API_KEY:      'llmApiKey',
};
