/**
 * API client — thin fetch wrapper over /api/*
 */

const BASE = '/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface Stats {
  totalMovies: number;
  totalFiles: number;
  scannedFiles: number;
  errorFiles: number;
  jfEnriched: number;
  totalLibrarySize: number;   // bytes, sum of all scanned file_size
  resolutionDist: Record<string, number>;
  codecDist: Record<string, number>;
  hdrCount: number;
  dolbyVisionCount: number;
  lastScan?: Record<string, unknown>;
}

export interface Movie {
  id: number;
  folder_path: string;
  folder_name: string;
  parsed_title: string | null;
  parsed_year: number | null;
  // Canonical link IDs (SUPER CRITICAL):
  // jellyfin_id  = Jellyfin UUID — primary curatarr↔Jellyfin link key; used for API refresh and Jellyfin web deep-link
  // imdb_id      = IMDb stable global ID — best cross-system identifier; linked to imdb.com
  // tmdb_id      = TMDb ID — linked to themoviedb.org
  jellyfin_id: string | null;
  jellyfin_title: string | null;
  jellyfin_year: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  critic_rating: number | null;
  community_rating: number | null;
  genres: string | null;
  overview: string | null;
  jf_synced_at: string | null;
  // curatarr augmentation (v6)
  tags: string;          // JSON array of strings
  notes: string | null;
  // from join (list view only — null in detail view)
  file_id: number | null;
  resolution_cat: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  audio_profile: string | null;
  file_size: number | null;
  mb_per_minute: number | null;
  release_group: string | null;
  hdr_formats: string;
  width: number | null;
  height: number | null;
  bit_depth: number | null;
  dv_profile: number | null;
  duration: number | null;
  // file scan health (list view)
  scan_error: string | null;
  scanned_at: string | null;
  verify_status: string | null;
  // v8 quality analytics
  quality_flags: string;   // JSON: QualityFlag[] — populated after deep verify
}

export interface MovieDetail extends Movie {
  files: FileRow[];
  dv_profile: number | null;
}

export interface FileRow {
  id: number;
  movie_id: number;
  file_path: string;
  filename: string;
  resolution: string | null;
  resolution_cat: string | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  video_bitrate: number | null;
  bit_depth: number | null;
  audio_codec: string | null;
  audio_profile: string | null;
  audio_channels: number | null;
  audio_layout: string | null;
  audio_tracks: string;
  subtitle_langs: string;
  file_size: number | null;
  duration: number | null;
  container: string | null;
  mb_per_minute: number | null;
  hdr_formats: string;
  release_group: string | null;
  scanned_at: string | null;
  scan_error: string | null;
}

export interface Candidate extends Movie {
  priority_score: number;
  file_file_path: string;
}

export interface QualityRule {
  id: number;
  category: string;
  name: string;
  enabled: number;
  priority: number;
  config: unknown;
}

export interface DisambiguateRequest {
  id: string;
  title: string;
  year?: number;
  imdbId?: string;
  folderPath?: string;
}

export interface DisambiguationLogRow {
  id: number;
  job_id: string;
  request_id: string;
  input_title: string;
  input_year: number | null;
  method: string | null;
  confidence: number | null;
  matched_movie_id: number | null;
  ambiguous: number;
  reason: string | null;
  reviewed: number;
  created_at: string;
}

export interface FolderEntry {
  name: string;
  size: number;
  isVideo: boolean;
}

export interface FolderContents {
  folderPath: string;
  contents: FolderEntry[];
  hasNonVideo: boolean;
}

export interface VerifyFailure {
  id: number;
  movie_id: number;
  file_path: string;
  filename: string;
  verify_status: string | null;
  verify_errors: string | null;
  verified_at: string | null;
  file_size: number | null;
  resolution_cat: string | null;
}

// ── API methods ────────────────────────────────────────────────────

export const api = {
  stats: () => req<Stats>('/stats'),

  movies: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ) : '';
    return req<{ total: number; page: number; limit: number; movies: Movie[] }>(`/movies${qs}`);
  },

  movie: (id: number) => req<MovieDetail>(`/movies/${id}`),

  patchMovie: (id: number, meta: { tags?: string[]; notes?: string }) =>
    req<{ updated: boolean }>(`/movies/${id}`, { method: 'PATCH', body: JSON.stringify(meta) }),

  jfRefreshMovie: (id: number) =>
    req<{ updated: boolean; movie: Movie }>(`/movies/${id}/jf-refresh`, { method: 'POST' }),

  movieFolderContents: (id: number) =>
    req<FolderContents>(`/movies/${id}/folder-contents`),

  deleteMovie: (id: number, mode: 'files' | 'folder') =>
    req<{ deleted: string[]; errors: string[]; mode: string }>(`/movies/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ mode }),
    }),

  candidates: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ) : '';
    return req<{ total: number; candidates: Candidate[] }>(`/candidates${qs}`);
  },

  triggerScan: (body: { path?: string; jobs?: number; rescan?: boolean }) =>
    req<{ started: boolean; libraryPath: string }>('/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scanHistory: () => req<{ runs: unknown[] }>('/scan/history'),

  triggerSync: (body: { url?: string; apiKey?: string; resync?: boolean }) =>
    req<{ started: boolean }>('/jf-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rules: (category?: string) => {
    const qs = category ? `?category=${category}` : '';
    return req<{ rules: Record<string, QualityRule[]> }>(`/rules${qs}`);
  },

  saveRules: (rules: Partial<QualityRule>[]) =>
    req<{ saved: number[] }>('/rules', { method: 'PUT', body: JSON.stringify({ rules }) }),

  deleteRule: (id: number) =>
    req<{ deleted: boolean }>(`/rules/${id}`, { method: 'DELETE' }),

  reorderRules: (category: string, ids: number[]) =>
    req<{ reordered: boolean }>('/rules/reorder', {
      method: 'POST',
      body: JSON.stringify({ category, ids }),
    }),

  settings: () => req<{ settings: Record<string, string> }>('/settings'),

  saveSettings: (settings: Record<string, string>) =>
    req<{ saved: string[] }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  health: () => req<{ jellyfin: { ok: boolean; libraries?: number; error?: string } }>('/settings/health'),

  disambiguateBatch: (items: DisambiguateRequest[]) =>
    req<{ jobId: string; queued: number }>('/disambiguate/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  disambiguatePending: () =>
    req<{ items: DisambiguationLogRow[]; pending: number; total: number }>('/disambiguate/pending'),

  disambiguateReview: (id: number, decision: 'confirm' | 'reject') =>
    req<{ updated: boolean }>(`/disambiguate/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  verifyStart: (opts?: { concurrency?: number; fileIds?: number[]; rescan?: boolean }) =>
    req<{ started: boolean; queued: number }>('/verify/start', {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  verifyCancel: () =>
    req<{ cancelled: boolean }>('/verify/cancel', { method: 'POST' }),

  verifyStatus: () =>
    req<{ running: boolean; unverified: number; pass: number; fail: number; error: number }>('/verify/status'),

  verifyFailures: (params?: { page?: number; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ) : '';
    return req<{ total: number; page: number; limit: number; failures: VerifyFailure[] }>(`/verify/failures${qs}`);
  },
};
