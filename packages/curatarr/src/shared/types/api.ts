export interface Stats {
  totalMovies: number;
  totalFiles: number;
  scannedFiles: number;
  errorFiles: number;
  jfEnriched: number;
  totalLibrarySize: number;
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
  tags: string;
  notes: string | null;
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
  scan_error: string | null;
  scanned_at: string | null;
  verify_status: string | null;
  quality_flags: string;
  disambiguation_required?: boolean;
  disambiguation_reason?: string | null;
  disambiguation_pending_id?: number | null;
  disambiguation_created_at?: string | null;
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
  dv_profile: number | null;
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

export interface MovieDetail extends Movie {
  files: FileRow[];
  dv_profile: number | null;
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
  stageScores?: {
    basic?: number;
    trash?: number;
    customCf?: number;
    llm?: number;
  };
}

export interface DroppedScoutRelease extends ScoutRelease {
  droppedReason: string;
}

export interface ScoutSearchOneResponse {
  movieId: number;
  query: string;
  total: number;
  releases: ScoutRelease[];
  droppedReleases: DroppedScoutRelease[];
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
  droppedReleases?: DroppedScoutRelease[];
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

export interface ScoutTrashParityResponse {
  state: 'in_sync' | 'drifted' | 'unknown';
  checkedAt: string;
  reason?: string;
  baselineCount: number;
  currentCount: number;
  diff: {
    added: Array<{ name: string; score: number }>;
    removed: Array<{ name: string; score: number }>;
    changed: Array<{ name: string; before: number; after: number }>;
  };
}

export interface ScoutCustomCfPreviewResponse {
  title: string;
  totalRules: number;
  delta: number;
  reasons: string[];
  matchedRuleIds: number[];
}

export interface ScoutRulesRefineDraftResponse {
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

export interface MoviesResponse {
  total: number;
  page: number;
  limit: number;
  movies: Movie[];
}

export interface GenresResponse {
  genres: string[];
}

export interface TagsResponse {
  tags: string[];
}

export interface CandidatesResponse {
  total: number;
  candidates: Candidate[];
}

export interface DisambiguatePendingResponse {
  items: DisambiguationLogRow[];
  unmatchedMovies: UnmatchedMovie[];
  pending: number;
  total: number;
}

export interface VerifyFailuresResponse {
  total: number;
  page: number;
  limit: number;
  failures: VerifyFailure[];
}
