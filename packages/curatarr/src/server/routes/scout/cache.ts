import { createHash } from 'node:crypto';
import type { CuratDb } from '../../../db/client.js';
import type { SearchSuccess } from './types.js';

export const SCOUT_CACHE_TTL_MS = 15 * 60 * 1000;
export const SCOUT_CACHE_MAX_ENTRIES = 512;

export interface ScoutCacheEntry {
  expiresAt: number;
  payload: SearchSuccess;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildScoutConfigRevision(db: CuratDb): string {
  const settings = Object.entries(db.getAllSettings())
    .filter(([k]) => k.startsWith('scout'))
    .sort(([a], [b]) => a.localeCompare(b));
  const rules = db
    .getRules()
    .filter((r) => ['scout_custom_cf', 'scout_release_blockers', 'scout_llm_ruleset'].includes(r.category))
    .map((r) => ({
      category: r.category,
      name: r.name,
      enabled: r.enabled,
      priority: r.priority,
      config: r.config,
      updated_at: r.updated_at,
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.priority - b.priority ||
        a.name.localeCompare(b.name) ||
        a.config.localeCompare(b.config),
    );
  const raw = stableJson({ settings, rules });
  return createHash('sha1').update(raw).digest('hex');
}

function normalizeScoutQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildScoutCacheKey(movieId: number, query: string, revision: string): string {
  return `${movieId}:${normalizeScoutQuery(query)}:${revision}`;
}

export function pruneScoutCache(cache: Map<string, ScoutCacheEntry>, now = Date.now()): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  if (cache.size <= SCOUT_CACHE_MAX_ENTRIES) return;
  const sorted = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const overflow = cache.size - SCOUT_CACHE_MAX_ENTRIES;
  for (const [key] of sorted.slice(0, overflow)) cache.delete(key);
}

export function withScoutCacheMeta(
  result: SearchSuccess,
  hit: boolean,
  revision: string,
  expiresAt: number,
): SearchSuccess {
  const ttlSecRemaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return {
    ...result,
    cache: {
      hit,
      ttlSecRemaining,
      revision,
    },
  };
}
