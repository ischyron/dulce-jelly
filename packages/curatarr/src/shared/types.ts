/**
 * Curatarr shared types
 * Platform-agnostic - no OS-specific code
 */

// ============================================================================
// Configuration
// ============================================================================

export interface CuratarrConfig {
  // Library paths
  library: {
    moviePaths: string[];
    tvPaths: string[];  // Future: TV support
  };

  // Indexer configuration (Newznab API)
  indexer: {
    url: string;
    apiKey: string;
    categories: {
      movies: number[];  // Newznab category IDs
      tv: number[];
    };
  };

  // Download client
  sabnzbd: {
    url: string;
    apiKey: string;
    category: string;
  };

  // TMDB for metadata
  tmdb: {
    apiKey: string;
  };

  // Jellyfin integration
  jellyfin: {
    url: string;
    apiKey: string;
  };

  // LLM configuration
  // Note: Only OpenAI supported in MVP. Provider architecture coming later.
  llm: {
    provider: 'openai';  // Hardcoded for MVP
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };

  // Quality profiles
  profiles: QualityProfile[];

  // Cache settings
  cache: {
    dbPath: string;
    searchTtlHours: number;
    maxEntries: number;
  };

  // Release group reputation
  groupReputation: {
    tier1: string[];
    tier2: string[];
    tier3: string[];
    blocked: string[];
  };

  // Rate limiting for upgrades
  rateLimits: RateLimitConfig;

  // Recycle bin for deleted files
  recycleBin: RecycleBinConfig;

  // Automatic upgrade polling
  upgradePolling: UpgradePollingConfig;
}

// ============================================================================
// Quality Profiles
// ============================================================================

export interface QualityProfile {
  name: string;
  resolution: '720p' | '1080p' | '2160p';
  minBitrate: number;      // kbps
  maxBitrate: number;      // kbps
  preferredBitrate: number;
  minSize: number;         // MB per minute
  maxSize: number;         // MB per minute
  preferredSize: number;
  allowedCodecs: string[];
  allowedSources: string[];
  blockedGroups: string[];
  preferHdr: boolean;
}

// ============================================================================
// Library Items
// ============================================================================

export interface LibraryItem {
  path: string;
  folderName: string;
  fileName: string;

  // Metadata (from TMDB or folder parsing)
  tmdbId?: number;
  imdbId?: string;
  title: string;
  year: number;
  genres: string[];

  // FFprobe quality metrics
  quality: FileQuality;

  // Calculated scores
  qualityScore: number;       // 0-100
  upgradeRecommended: boolean;
  targetProfile?: string;
}

export interface FileQuality {
  // Video
  resolution: string;         // "1920x1080"
  resolutionCategory: '720p' | '1080p' | '2160p' | 'other';
  videoBitrate: number;       // kbps
  videoCodec: string;         // x264, x265, av1
  hdrType: string | null;     // HDR10, DV, HLG, HDR10+
  bitDepth: number;           // 8, 10, 12

  // Audio
  audioBitrate: number;       // kbps
  audioCodec: string;         // aac, dts, truehd
  audioChannels: string;      // 2.0, 5.1, 7.1

  // File
  fileSize: number;           // bytes
  duration: number;           // seconds
  container: string;          // mkv, mp4

  // Calculated
  bitratePerMinute: number;   // kbps per minute of content
}

// ============================================================================
// Search & Releases
// ============================================================================

export interface SearchQuery {
  title: string;
  year?: number;
  imdbId?: string;
  tmdbId?: number;
  profile?: string;
}

export interface Release {
  guid: string;
  indexer: string;
  title: string;
  size: number;              // bytes
  age: number;               // days
  grabs: number;
  category: string;
  imdbId?: string;
  tvdbId?: string;

  // Parsed from title
  parsed: ParsedRelease;

  // Scoring
  qualityScore: number;
  groupTier: 'tier1' | 'tier2' | 'tier3' | 'unknown' | 'blocked';
  passesQualityGates: boolean;
  sizeValid: boolean;        // size matches claimed quality

  // LLM evaluation
  evaluation?: LLMEvaluation;

  // Final ranking
  rank?: number;
  recommendation: 'accept' | 'reject' | 'review';
}

export interface ParsedRelease {
  title: string;
  year?: number;
  resolution?: string;
  source?: string;           // WEB-DL, BluRay, HDTV
  codec?: string;            // x264, x265, AV1
  hdr?: string;              // HDR, HDR10, DV
  audio?: string;            // DTS, Atmos, TrueHD
  group?: string;
  proper?: boolean;
  repack?: boolean;
  streaming?: string;        // AMZN, NF, ATVP
}

// ============================================================================
// LLM Evaluation
// ============================================================================

export interface LLMEvaluation {
  contentMatch: {
    confidence: number;      // 0-100
    reasoning: string;
    isCorrectContent: boolean;
    flags: ContentFlag[];
  };

  qualityAuthenticity: {
    confidence: number;      // 0-100
    reasoning: string;
    isAuthentic: boolean;
    flags: QualityFlag[];
  };

  upgradeValue?: {
    confidence: number;
    reasoning: string;
    worthUpgrade: boolean;
    sizeIncrease: string;    // "+5.2 GB"
  };

  recommendation: 'accept' | 'reject' | 'review';
  overallConfidence: number;
}

export type ContentFlag =
  | 'wrong_content_type'     // movie vs tv vs sports
  | 'wrong_year'
  | 'sequel_confusion'
  | 'remake_confusion'
  | 'similar_title'
  | 'foreign_title';

export type QualityFlag =
  | 'size_mismatch'          // claimed 4K but 2GB
  | 'unknown_group'
  | 'blocked_group'
  | 'suspicious_claims'      // too many quality keywords
  | 'cam_or_ts'
  | 'encode_of_encode';

// ============================================================================
// TMDB Types
// ============================================================================

export interface TMDBMovie {
  id: number;
  imdb_id: string;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number;
  genres: { id: number; name: string }[];
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
}

// ============================================================================
// Activity Logging
// ============================================================================

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: ActivityAction;
  details: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export type ActivityAction =
  | 'scan_library'
  | 'search'
  | 'evaluate'
  | 'grab'
  | 'import'
  | 'upgrade_check'
  | 'jellyfin_rescan'
  | 'monitor_check'
  | 'health_check';

// ============================================================================
// Monitor / Dashboard Types
// ============================================================================

export type IssueSeverity = 'info' | 'warning' | 'error';

export interface LibraryIssue {
  id: string;
  severity: IssueSeverity;
  type: LibraryIssueType;
  title: string;
  path: string;
  jellyfinId?: string;
  details: string;
  detectedAt: string;
  resolved: boolean;
}

export type LibraryIssueType =
  | 'missing_file'           // File in Jellyfin but not on disk
  | 'missing_folder'         // Folder in Jellyfin but not on disk
  | 'multiple_video_files'   // More than 1 video file in movie folder
  | 'empty_folder'           // Folder exists but no video files
  | 'orphan_file'            // File on disk but not in Jellyfin
  | 'metadata_mismatch';     // Title/year mismatch between Jellyfin and folder

export interface HealthStatus {
  service: ServiceName;
  status: 'healthy' | 'degraded' | 'unreachable';
  lastCheck: string;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export type ServiceName =
  | 'jellyfin'
  | 'indexer'
  | 'sabnzbd'
  | 'tmdb'
  | 'llm'
  | 'filesystem';

export interface DashboardState {
  // Library issues grouped by severity
  library: {
    info: LibraryIssue[];
    warning: LibraryIssue[];
    error: LibraryIssue[];
    lastScan: string | null;
    totalItems: number;
  };

  // Service health
  health: {
    overall: IssueSeverity;  // Aggregate: error if any error, warning if any warning
    services: HealthStatus[];
    lastCheck: string | null;
  };
}

// ============================================================================
// Jellyfin API Types
// ============================================================================

export interface JellyfinItem {
  Id: string;
  Name: string;
  Path: string;
  Type: 'Movie' | 'Series' | 'Episode' | 'Folder';
  ProductionYear?: number;
  ProviderIds?: {
    Imdb?: string;
    Tmdb?: string;
  };
  MediaSources?: JellyfinMediaSource[];
}

export interface JellyfinMediaSource {
  Id: string;
  Path: string;
  Size: number;
  Container: string;
}

export interface JellyfinLibrary {
  Id: string;
  Name: string;
  CollectionType: 'movies' | 'tvshows' | 'music' | 'unknown';
  Path: string;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
  movies: {
    maxPerDay: number;
    maxPerHour: number;
    cooldownMinutes: number;
  };
  episodes: {
    maxPerDay: number;
    maxPerHour: number;
    cooldownMinutes: number;
  };
  global: {
    maxConcurrent: number;
    pauseOnDiskSpaceMB: number;
  };
}

export interface RateLimitState {
  movies: {
    countToday: number;
    countThisHour: number;
    lastUpgrade: string | null;
    resetAt: string;
  };
  episodes: {
    countToday: number;
    countThisHour: number;
    lastUpgrade: string | null;
    resetAt: string;
  };
  concurrent: number;
  paused: boolean;
  pauseReason?: string;
}

// ============================================================================
// Recycle Bin
// ============================================================================

export interface RecycleBinConfig {
  enabled: boolean;
  path: string;
  retentionDays: number;
  maxSizeGB: number;
  allowPermanentDelete: boolean;  // Dangerous option
}

export interface RecycledItem {
  id: string;
  originalPath: string;
  recyclePath: string;
  fileName: string;
  fileSize: number;
  deletedAt: string;
  expiresAt: string;
  reason: string;
  jellyfinId?: string;
  tmdbId?: number;
  title?: string;
}

export interface RecycleBinStats {
  totalItems: number;
  totalSizeBytes: number;
  oldestItem: string | null;
  newestItem: string | null;
  expiringIn24h: number;
}

// ============================================================================
// Upgrade Polling
// ============================================================================

export interface UpgradePollingConfig {
  enabled: boolean;
  schedule: string;           // Cron expression
  batchSize: number;
  minAgeHours: number;
  requireConfirmation: boolean;
}

export interface UpgradeCandidate {
  libraryItem: LibraryItem;
  currentQuality: FileQuality;
  targetProfile: string;
  candidates: Release[];
  bestCandidate?: Release;
  upgradeScore: number;       // How much better the upgrade is
  recommendation: 'upgrade' | 'skip' | 'review';
}
