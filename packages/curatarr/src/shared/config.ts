/**
 * Configuration loader for Curatarr
 * Loads from YAML config file with environment variable expansion
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'yaml';

import { CuratarrConfig, QualityProfile } from './types.js';

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
  const raw = deepExpand(parse(content)) as Partial<CuratarrConfig>;

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
      provider: raw.llm.provider ?? 'openai',
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
  };

  return config;
}

/**
 * Get config file path for display
 */
export function getConfigPath(baseDir: string): string | null {
  return findConfigFile(baseDir);
}
