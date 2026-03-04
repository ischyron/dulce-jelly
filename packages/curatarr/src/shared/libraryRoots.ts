import os from 'node:os';
import path from 'node:path';

export type LibraryRootType = 'movies' | 'series';

export interface LibraryRootEntry {
  type: LibraryRootType;
  path: string;
}

export function normalizeLibraryPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const expanded = trimmed.replace(/^~(?=\/|$)/, os.homedir());
  return expanded.replace(/\/+$/, '') || '/';
}

function toType(v: unknown): LibraryRootType | null {
  if (typeof v !== 'string') return null;
  const lower = v.trim().toLowerCase();
  if (lower === 'movies' || lower === 'series') return lower;
  return null;
}

export function normalizeLibraryRoots(entries: LibraryRootEntry[]): LibraryRootEntry[] {
  const out: LibraryRootEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalizedPath = normalizeLibraryPath(entry.path);
    if (!normalizedPath) continue;
    const key = `${entry.type}:${normalizedPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: entry.type, path: normalizedPath });
  }
  return out;
}

export function parseLibraryRootsUnknown(raw: unknown): LibraryRootEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryRootEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const type = toType(obj.type);
    const p = typeof obj.path === 'string' ? obj.path : '';
    if (!type) continue;
    out.push({ type, path: p });
  }
  return normalizeLibraryRoots(out);
}

export function parseLibraryRootsJson(raw: string | undefined): LibraryRootEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return parseLibraryRootsUnknown(parsed);
  } catch {
    return [];
  }
}

export function stringifyLibraryRoots(entries: LibraryRootEntry[]): string {
  return JSON.stringify(normalizeLibraryRoots(entries));
}

export function validateLibraryRootsEntries(entries: LibraryRootEntry[]): string | null {
  for (const entry of entries) {
    if (!entry.path || !entry.path.trim()) return 'Library root path cannot be empty.';
    if (entry.type !== 'movies' && entry.type !== 'series') return `Unsupported library root type: ${entry.type}`;
  }
  return null;
}

export function movieLibraryPaths(entries: LibraryRootEntry[]): string[] {
  return normalizeLibraryRoots(entries)
    .filter((e) => e.type === 'movies')
    .map((e) => path.resolve(normalizeLibraryPath(e.path)));
}

