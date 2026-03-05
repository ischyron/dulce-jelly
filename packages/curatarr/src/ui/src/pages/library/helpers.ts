import { PERSIST_FILTER_KEYS, SORT_FIELDS, type SortField } from './types.js';

export function toSortField(value: string | null): SortField {
  if (!value) return 'title';
  return SORT_FIELDS.has(value as SortField) ? (value as SortField) : 'title';
}

export function toSortDir(value: string | null): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc';
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function fmtTotalSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

export function sp(params: URLSearchParams, key: string, fallback: string): string {
  return params.get(key) ?? fallback;
}

export function spInt(params: URLSearchParams, key: string, fallback: number): number {
  const v = params.get(key);
  const n = v ? parseInt(v, 10) : Number.NaN;
  return Number.isNaN(n) ? fallback : n;
}

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export function persistedFilterParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of PERSIST_FILTER_KEYS) {
    const value = params.get(key);
    if (value != null && value !== '') next.set(key, value);
  }
  return next;
}
