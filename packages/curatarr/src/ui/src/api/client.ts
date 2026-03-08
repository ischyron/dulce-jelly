/**
 * API client — thin fetch wrapper over /api/*
 */

import type {
  Candidate,
  CandidatesResponse,
  DisambiguatePendingResponse,
  DisambiguateRequest,
  DisambiguationLogRow,
  DroppedScoutRelease,
  FileRow,
  FolderContents,
  GenresResponse,
  Movie,
  MovieDetail,
  MoviesResponse,
  QualityRule,
  ScanHistoryRun,
  ScoutAutoRunResponse,
  ScoutAutoStatusResponse,
  ScoutBatchItem,
  ScoutCustomCfPreviewResponse,
  ScoutRelease,
  ScoutRulesRefineDraftResponse,
  ScoutSearchBatchResponse,
  ScoutSearchOneResponse,
  ScoutSendToSabRequest,
  ScoutSendToSabResponse,
  ScoutTrashParityResponse,
  ScoutTrashSyncDetailsResponse,
  ScoutTrashSyncResponse,
  Stats,
  TagsResponse,
  UnmatchedMovie,
  VerifyFailure,
  VerifyFailuresResponse,
} from '../../../shared/types/api';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(message: string, opts: { status: number; code?: string; detail?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
    const code = body?.error;
    const detail = body?.detail;
    const text = await res.text().catch(() => res.statusText);
    const message = code ?? detail ?? text;
    throw new ApiError(message, { status: res.status, code, detail });
  }
  return res.json() as Promise<T>;
}

export type {
  Candidate,
  DisambiguateRequest,
  DisambiguationLogRow,
  DroppedScoutRelease,
  FileRow,
  FolderContents,
  Movie,
  MovieDetail,
  QualityRule,
  ScanHistoryRun,
  ScoutBatchItem,
  ScoutCustomCfPreviewResponse,
  ScoutRelease,
  ScoutRulesRefineDraftResponse,
  ScoutSearchBatchResponse,
  ScoutSearchOneResponse,
  ScoutSendToSabRequest,
  ScoutSendToSabResponse,
  ScoutTrashParityResponse,
  ScoutTrashSyncDetailsResponse,
  ScoutTrashSyncResponse,
  Stats,
  UnmatchedMovie,
  VerifyFailure,
};

export const api = {
  stats: () => req<Stats>('/stats'),

  movies: (params?: Record<string, string | number | boolean>) => {
    const qs = params
      ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))}`
      : '';
    return req<MoviesResponse>(`/movies${qs}`);
  },
  genres: () => req<GenresResponse>('/movies/genres'),
  tags: () => req<TagsResponse>('/movies/tags'),

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

  movieFolderContents: (id: number) => req<FolderContents>(`/movies/${id}/folder-contents`),

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
    const qs = params
      ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))}`
      : '';
    return req<CandidatesResponse>(`/candidates${qs}`);
  },

  triggerScan: (body: { path?: string; jobs?: number; rescan?: boolean }) =>
    req<{ started: boolean; libraryPaths: string[] }>('/scan', {
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

  replaceRulesCategory: (category: string, rules: Partial<QualityRule>[]) =>
    req<{ saved: number[] }>('/rules/replace-category', {
      method: 'PUT',
      body: JSON.stringify({ category, rules }),
    }),

  deleteRule: (id: number) => req<{ deleted: boolean }>(`/rules/${id}`, { method: 'DELETE' }),

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
      ? `?${new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v)
              .map(([k, v]) => [k, v as string]),
          ),
        )}`
      : '';
    return req<{
      jellyfin: { ok: boolean; libraries?: number; error?: string };
      prowlarr: { ok: boolean; indexers?: number; error?: string };
    }>(`/settings/health${qs}`);
  },

  fsRoots: () => req<{ mode: 'docker-mounted' | 'local-full'; roots: string[]; restricted: boolean }>('/fs/roots'),

  fsBrowse: (params?: { path?: string }) => {
    const qs = params?.path ? `?path=${encodeURIComponent(params.path)}` : '';
    return req<{
      mode: 'docker-mounted' | 'local-full';
      restricted: boolean;
      roots: string[];
      currentPath: string;
      parentPath: string | null;
      entries: Array<{ name: string; path: string }>;
    }>(`/fs/browse${qs}`);
  },

  disambiguateBatch: (items: DisambiguateRequest[]) =>
    req<{ jobId: string; queued: number }>('/disambiguate/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  disambiguatePending: () => req<DisambiguatePendingResponse>('/disambiguate/pending'),

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

  verifyCancel: () => req<{ cancelled: boolean }>('/verify/cancel', { method: 'POST' }),

  verifyStatus: () =>
    req<{ running: boolean; unverified: number; pass: number; fail: number; error: number }>('/verify/status'),

  verifyFailures: (params?: { page?: number; limit?: number }) => {
    const qs = params
      ? `?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))}`
      : '';
    return req<VerifyFailuresResponse>(`/verify/failures${qs}`);
  },

  scoutSearchOne: (body: { movieId: number; query?: string; forceRefresh?: boolean }) =>
    req<ScoutSearchOneResponse>('/scout/search-one', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutSearchBatch: (body: { movieIds: number[]; batchSize?: number }) =>
    req<ScoutSearchBatchResponse>('/scout/search-batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutSendToSab: (body: ScoutSendToSabRequest) =>
    req<ScoutSendToSabResponse>('/scout/send-to-sab', {
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

  scoutTrashSyncDetails: () => req<ScoutTrashSyncDetailsResponse>('/scout/trash-sync-details'),

  scoutTrashParity: (refresh = false) =>
    req<ScoutTrashParityResponse>(`/scout/trash-parity${refresh ? '?refresh=1' : ''}`),

  scoutCustomCfPreview: (body: { title: string }) =>
    req<ScoutCustomCfPreviewResponse>('/scout/custom-cf/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutRulesRefineDraft: (body: { objective: string }) =>
    req<ScoutRulesRefineDraftResponse>('/scout/rules/refine-draft', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  scoutRules: () => req<{ rules: Record<string, QualityRule[]> }>('/scout/rules'),

  scoutReplaceRulesCategory: (category: string, rules: Partial<QualityRule>[]) =>
    req<{ saved: number[] }>('/scout/rules/replace-category', {
      method: 'PUT',
      body: JSON.stringify({ category, rules }),
    }),
};
