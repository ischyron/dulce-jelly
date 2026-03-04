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
    const body = await res.json().catch(() => null);
    const msg = (body as { error?: string } | null)?.error
      ?? await res.text().catch(() => res.statusText);
    throw new Error(msg);
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
  audioCodecDist: Record<string, number>;
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
  audio_channels: number | null;
  audio_layout: string | null;
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
  // disambiguation / metadata resolution state
  disambiguation_required?: boolean;
  disambiguation_reason?: string | null;
  disambiguation_pending_id?: number | null;
  disambiguation_created_at?: string | null;
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
  priority_reasons?: string[];
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
  // Joined from movies table
  db_folder_name?: string | null;
  db_folder_path?: string | null;
  db_parsed_year?: number | null;
}

export interface UnmatchedMovie {
  id: number;
  folder_name: string;
  parsed_title: string | null;
  parsed_year: number | null;
  jellyfin_id: string | null;
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
  folderExists: boolean;
  videoCount: number;
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

export interface ScoutRelease {
  title: string;
  indexer: string | null;
  protocol: 'torrent' | 'usenet' | 'unknown';
  size: number | null;
  publishDate: string | null;
  guid: string | null;
  downloadUrl: string | null;
  seeders: number | null;
  peers: number | null;
  score: number;
  reasons: string[];
}

export interface ScoutSearchOneResponse {
  movieId: number;
  query: string;
  total: number;
  releases: ScoutRelease[];
  recommendation: {
    mode: 'tabulated';
    summary: string;
    best: ScoutRelease | null;
  };
}

export interface ScoutBatchItem {
  movieId: number;
  query?: string;
  total?: number;
  releases?: ScoutRelease[];
  error?: string;
}

export interface ScoutSearchBatchResponse {
  processed: number;
  maxAllowed: number;
  results: ScoutBatchItem[];
}

export interface ScoutAutoStatusResponse {
  running: boolean;
  lastRun: {
    trigger: 'manual' | 'scheduled';
    maxAllowed: number;
    requested: number;
    processed: number;
    skippedByCooldown: number;
    startedAt: string;
    finishedAt: string;
  } | null;
}

export interface ScoutAutoRunResponse {
  trigger: 'manual' | 'scheduled';
  maxAllowed: number;
  requested: number;
  processed: number;
  skippedByCooldown: number;
  startedAt: string;
  finishedAt: string;
}

export interface ScoutTrashSyncResponse {
  applied: Record<string, string>;
  syncedRules: number;
  meta: {
    source: string;
    revision: string | null;
    fetchedAt: string;
    warning?: string;
  };
  details?: ScoutTrashSyncDetailsResponse;
}

export interface ScoutTrashSyncDetailsResponse {
  meta: {
    source: string;
    revision: string | null;
    syncedAt: string | null;
    rulesSynced: number;
    warning?: string;
  };
  applied: {
    settings: Record<string, string>;
    rules: Array<{
      id: number;
      name: string;
      priority: number;
      enabled: boolean;
      config: unknown;
    }>;
  };
  upstream: {
    path: string;
    fileCount: number;
    truncated: boolean;
    files: Array<{
      name: string;
      size: number;
      downloadUrl: string;
      parsedJson?: unknown;
      warning?: string;
    }>;
  } | null;
}

export interface ScoutRulesRefineDraftResponse {
  mode: 'heuristic';
  objective: string;
  prompt: string;
  proposedSettings: Record<string, string>;
  suggestedRuleToggles: Array<{ id: number; name: string; enabled: boolean }>;
}

export interface ScanHistoryRun {
  id: number;
  started_at: string | null;
  finished_at: string | null;
  root_path: string;
  total_folders: number | null;
  total_files: number | null;
  scanned_ok: number | null;
  scan_errors: number | null;
  duration_sec: number | null;
  notes: string | null;
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
  genres: () => req<{ genres: string[] }>('/movies/genres'),
  tags: () => req<{ tags: string[] }>('/movies/tags'),

  movie: (id: number) => req<MovieDetail>(`/movies/${id}`),

  patchMovie: (id: number, meta: { tags?: string[]; notes?: string }) =>
    req<{ updated: boolean }>(`/movies/${id}`, { method: 'PATCH', body: JSON.stringify(meta) }),
  patchMovieTagsBatch: (body: { ids: number[]; addTags?: string[]; removeTags?: string[] }) =>
    req<{ updated: number; requested: number }>('/movies/tags/batch', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  jfRefreshMovie: (id: number) =>
    req<{ updated: boolean; movie: Movie }>(`/movies/${id}/jf-refresh`, { method: 'POST' }),

  movieFolderContents: (id: number) =>
    req<FolderContents>(`/movies/${id}/folder-contents`),

  deleteMovie: (id: number, mode: 'files' | 'folder') =>
    req<{ deleted: string[]; errors: string[]; mode: string }>(`/movies/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ mode }),
    }),

  removeMoviesFromIndex: (ids: number[]) =>
    req<{ deleted: number; requested: number }>('/movies/remove-index', {
      method: 'POST',
      body: JSON.stringify({ ids }),
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

  scanStatus: () => req<{ running: boolean }>('/scan/status'),

  scanHistory: () => req<{ runs: ScanHistoryRun[] }>('/scan/history'),

  triggerSync: (body: { url?: string; apiKey?: string; resync?: boolean }) =>
    req<{ started: boolean }>('/jf-sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  syncStatus: () => req<{ running: boolean }>('/jf-sync/status'),

  syncCancel: () => req<{ cancelled: boolean }>('/jf-sync/cancel', { method: 'POST' }),

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

  health: (params?: { url?: string; apiKey?: string; prowlarrUrl?: string; prowlarrApiKey?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, v!]))
        )
      : '';
    return req<{
      jellyfin: { ok: boolean; libraries?: number; error?: string };
      prowlarr: { ok: boolean; indexers?: number; error?: string };
    }>(`/settings/health${qs}`);
  },

  disambiguateBatch: (items: DisambiguateRequest[]) =>
    req<{ jobId: string; queued: number }>('/disambiguate/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  disambiguatePending: () =>
    req<{ items: DisambiguationLogRow[]; unmatchedMovies: UnmatchedMovie[]; pending: number; total: number }>('/disambiguate/pending'),

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

  scoutSearchOne: (body: { movieId: number; query?: string }) =>
    req<ScoutSearchOneResponse>('/scout/search-one', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutSearchBatch: (body: { movieIds: number[]; batchSize?: number }) =>
    req<ScoutSearchBatchResponse>('/scout/search-batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutAutoRun: () =>
    req<ScoutAutoRunResponse>('/scout/auto-run', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  scoutAutoStatus: () => req<ScoutAutoStatusResponse>('/scout/auto-status'),

  scoutSyncTrashScores: () =>
    req<ScoutTrashSyncResponse>('/scout/sync-trash-scores', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  scoutTrashSyncDetails: () =>
    req<ScoutTrashSyncDetailsResponse>('/scout/trash-sync-details'),

  scoutRulesRefineDraft: (body: { objective: string }) =>
    req<ScoutRulesRefineDraftResponse>('/scout/rules/refine-draft', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
