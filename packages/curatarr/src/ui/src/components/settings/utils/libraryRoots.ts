import type { LibraryRootEntry } from '../types';

export function normalizeRootPath(input: string): string {
  return (input ?? '').trim().replace(/\/+$/, '');
}

export function parseLibraryRoots(raw: string | undefined): LibraryRootEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is { type: string; path: string } => !!row && typeof row === 'object')
      .map(
        (row): LibraryRootEntry => ({
          type: row.type === 'series' ? 'series' : 'movies',
          path: typeof row.path === 'string' ? row.path : '',
        }),
      )
      .filter((row) => row.path.trim().length > 0);
  } catch {
    return [];
  }
}

export function toLibraryRootsJson(entries: LibraryRootEntry[]): string {
  const seen = new Set<string>();
  const normalized = entries
    .map((e) => ({ type: e.type, path: normalizeRootPath(e.path) }))
    .filter((e) => e.path.length > 0)
    .filter((e) => {
      const key = `${e.type}:${e.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return JSON.stringify(normalized);
}
