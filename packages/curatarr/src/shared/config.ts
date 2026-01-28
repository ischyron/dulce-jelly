/**
 * Configuration loader for Curatarr
 * Loads from YAML config file with environment variable expansion
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

import {
  CuratarrConfig,
  QualityProfile,
  RateLimitConfig,
  RecycleBinConfig,
  UpgradePollingConfig,
} from './types.js';

const DEFAULT_PROFILES: QualityProfile[] = [
  {
    name: 'HD',
    resolution: '1080p',
    minBitrate: 4000,
    maxBitrate: 15000,
    preferredBitrate: 8000,
    minSize: 8,
    maxSize: 75,
    preferredSize: 30,
    allowedCodecs: ['x264', 'x265', 'hevc'],
    allowedSources: ['bluray', 'webdl', 'webrip'],
    blockedGroups: [],
    preferHdr: false,
  },
  {
    name: 'Efficient-4K',
    resolution: '2160p',
    minBitrate: 8000,
    maxBitrate: 40000,
    preferredBitrate: 20000,
    minSize: 20,
    maxSize: 130,
    preferredSize: 70,
    allowedCodecs: ['x265', 'hevc', 'av1'],
    allowedSources: ['webdl', 'webrip'],
    blockedGroups: [],
    preferHdr: true,
  },
  {
    name: 'HighQuality-4K',
    resolution: '2160p',
    minBitrate: 20000,
    maxBitrate: 80000,
    preferredBitrate: 45000,
    minSize: 45,
    maxSize: 170,
    preferredSize: 100,
    allowedCodecs: ['x265', 'hevc', 'av1'],
    allowedSources: ['bluray', 'webdl'],
    blockedGroups: [],
    preferHdr: true,
  },
];

const DEFAULT_GROUP_REPUTATION = {
  tier1: [
    'BHDStudio',
    'DON',
    'FraMeSToR',
    'HiFi',
    'playBD',
    'FLUX',
    'TEPES',
    'HONE',
    'W4NK3R',
  ],
  tier2: ['SPARKS', 'GECKOS', 'NTb', 'CMRG', 'SiGMA', 'TOMMY', 'EDITH'],
  tier3: ['YTS', 'YIFY', 'RARBG', 'EVO', 'FGT'],
  blocked: ['aXXo', 'KLAXXON', 'MeGusta', 'mSD', 'nSD'],
};

const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  movies: {
    maxPerDay: 10,
    maxPerHour: 3,
    cooldownMinutes: 30,
  },
  episodes: {
    maxPerDay: 50,
    maxPerHour: 10,
    cooldownMinutes: 5,
  },
  global: {
    maxConcurrent: 2,
    pauseOnDiskSpaceMB: 50000,
  },
};

const DEFAULT_RECYCLE_BIN: RecycleBinConfig = {
  enabled: true,
  path: '/media/.curatarr-recycle',
  retentionDays: 30,
  maxSizeGB: 500,
  allowPermanentDelete: false,  // Safe default
};

const DEFAULT_UPGRADE_POLLING: UpgradePollingConfig = {
  enabled: false,
  schedule: '0 3 * * *',  // 3 AM daily
  batchSize: 50,
  minAgeHours: 48,
  requireConfirmation: true,
};

/**
 * Expand environment variables in a string
 * Supports ${VAR} syntax
 */
function expandEnv(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '');
}

/**
 * Recursively expand environment variables in an object
 */
function deepExpand(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(deepExpand);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepExpand(v);
    }
    return out;
  }
  return expandEnv(obj);
}

/**
 * Find config file from multiple candidate locations
 */
function findConfigFile(baseDir: string): string | null {
  const candidates = [
    process.env.CURATARR_CONFIG,
    path.join(baseDir, 'config/config.yaml'),
    path.join(baseDir, 'config.yaml'),
    path.join(process.cwd(), 'curatarr.yaml'),
    path.join(process.cwd(), 'config/curatarr.yaml'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Find secrets file from multiple candidate locations
 */
function findSecretsFile(baseDir: string): string | null {
  const candidates = [
    process.env.CURATARR_SECRETS,
    path.join(baseDir, 'config/secrets.yaml'),
    path.join(baseDir, 'secrets.yaml'),
    path.join(process.cwd(), 'secrets.yaml'),
    path.join(process.cwd(), 'config/secrets.yaml'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Deep merge two objects (secrets override config)
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined && sourceValue !== null && sourceValue !== '') {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Load and validate configuration
 */
export function loadConfig(baseDir: string): CuratarrConfig {
  const configPath = findConfigFile(baseDir);

  if (!configPath) {
    throw new Error(
      'No config file found. Create config/config.yaml or set CURATARR_CONFIG env var.'
    );
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  let merged = deepExpand(parse(content)) as Record<string, unknown>;

  // Load secrets file if present and merge with config
  const secretsPath = findSecretsFile(baseDir);
  if (secretsPath) {
    const secretsContent = fs.readFileSync(secretsPath, 'utf-8');
    const secrets = deepExpand(parse(secretsContent)) as Record<string, unknown>;
    merged = deepMerge(merged, secrets);
  }

  // Cast to partial config after merge
  const raw = merged as Partial<CuratarrConfig>;

  // Validate required fields
  if (!raw.indexer?.url || !raw.indexer?.apiKey) {
    throw new Error('indexer.url and indexer.apiKey are required');
  }
  if (!raw.sabnzbd?.url || !raw.sabnzbd?.apiKey) {
    throw new Error('sabnzbd.url and sabnzbd.apiKey are required');
  }
  if (!raw.tmdb?.apiKey) {
    throw new Error('tmdb.apiKey is required');
  }
  if (!raw.llm?.apiKey) {
    throw new Error('llm.apiKey is required');
  }

  // Build config with defaults
  const config: CuratarrConfig = {
    library: {
      moviePaths: raw.library?.moviePaths ?? [],
      tvPaths: raw.library?.tvPaths ?? [],
    },
    indexer: {
      url: raw.indexer.url,
      apiKey: raw.indexer.apiKey,
      categories: {
        movies: raw.indexer.categories?.movies ?? [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060],
        tv: raw.indexer.categories?.tv ?? [5000, 5020, 5030, 5040, 5045, 5050, 5060],
      },
    },
    sabnzbd: {
      url: raw.sabnzbd.url,
      apiKey: raw.sabnzbd.apiKey,
      category: raw.sabnzbd.category ?? 'movies',
    },
    tmdb: {
      apiKey: raw.tmdb.apiKey,
    },
    jellyfin: {
      url: raw.jellyfin?.url ?? '',
      apiKey: raw.jellyfin?.apiKey ?? '',
    },
    llm: {
      provider: 'openai',  // Hardcoded for MVP - provider architecture coming later
      apiKey: raw.llm.apiKey,
      model: raw.llm.model ?? 'gpt-4o',
      temperature: raw.llm.temperature ?? 0.1,
      maxTokens: raw.llm.maxTokens ?? 1024,
    },
    profiles: raw.profiles ?? DEFAULT_PROFILES,
    cache: {
      dbPath: raw.cache?.dbPath ?? path.join(baseDir, 'data/curatarr.sqlite'),
      searchTtlHours: raw.cache?.searchTtlHours ?? 24,
      maxEntries: raw.cache?.maxEntries ?? 50000,
    },
    groupReputation: {
      tier1: raw.groupReputation?.tier1 ?? DEFAULT_GROUP_REPUTATION.tier1,
      tier2: raw.groupReputation?.tier2 ?? DEFAULT_GROUP_REPUTATION.tier2,
      tier3: raw.groupReputation?.tier3 ?? DEFAULT_GROUP_REPUTATION.tier3,
      blocked: raw.groupReputation?.blocked ?? DEFAULT_GROUP_REPUTATION.blocked,
    },
    rateLimits: {
      movies: {
        maxPerDay: raw.rateLimits?.movies?.maxPerDay ?? DEFAULT_RATE_LIMITS.movies.maxPerDay,
        maxPerHour: raw.rateLimits?.movies?.maxPerHour ?? DEFAULT_RATE_LIMITS.movies.maxPerHour,
        cooldownMinutes: raw.rateLimits?.movies?.cooldownMinutes ?? DEFAULT_RATE_LIMITS.movies.cooldownMinutes,
      },
      episodes: {
        maxPerDay: raw.rateLimits?.episodes?.maxPerDay ?? DEFAULT_RATE_LIMITS.episodes.maxPerDay,
        maxPerHour: raw.rateLimits?.episodes?.maxPerHour ?? DEFAULT_RATE_LIMITS.episodes.maxPerHour,
        cooldownMinutes: raw.rateLimits?.episodes?.cooldownMinutes ?? DEFAULT_RATE_LIMITS.episodes.cooldownMinutes,
      },
      global: {
        maxConcurrent: raw.rateLimits?.global?.maxConcurrent ?? DEFAULT_RATE_LIMITS.global.maxConcurrent,
        pauseOnDiskSpaceMB: raw.rateLimits?.global?.pauseOnDiskSpaceMB ?? DEFAULT_RATE_LIMITS.global.pauseOnDiskSpaceMB,
      },
    },
    recycleBin: {
      enabled: raw.recycleBin?.enabled ?? DEFAULT_RECYCLE_BIN.enabled,
      path: raw.recycleBin?.path ?? DEFAULT_RECYCLE_BIN.path,
      retentionDays: raw.recycleBin?.retentionDays ?? DEFAULT_RECYCLE_BIN.retentionDays,
      maxSizeGB: raw.recycleBin?.maxSizeGB ?? DEFAULT_RECYCLE_BIN.maxSizeGB,
      allowPermanentDelete: raw.recycleBin?.allowPermanentDelete ?? DEFAULT_RECYCLE_BIN.allowPermanentDelete,
    },
    upgradePolling: {
      enabled: raw.upgradePolling?.enabled ?? DEFAULT_UPGRADE_POLLING.enabled,
      schedule: raw.upgradePolling?.schedule ?? DEFAULT_UPGRADE_POLLING.schedule,
      batchSize: raw.upgradePolling?.batchSize ?? DEFAULT_UPGRADE_POLLING.batchSize,
      minAgeHours: raw.upgradePolling?.minAgeHours ?? DEFAULT_UPGRADE_POLLING.minAgeHours,
      requireConfirmation: raw.upgradePolling?.requireConfirmation ?? DEFAULT_UPGRADE_POLLING.requireConfirmation,
    },
  };

  return config;
}

/**
 * Get config file path for display
 */
export function getConfigPath(baseDir: string): string | null {
  return findConfigFile(baseDir);
}

/**
 * Get secrets file path for display
 */
export function getSecretsPath(baseDir: string): string | null {
  return findSecretsFile(baseDir);
}
