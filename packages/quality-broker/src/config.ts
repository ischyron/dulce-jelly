import fs from 'fs';
import path from 'path';

import { parse } from 'yaml';

import { BrokerConfig, LLMPolicy, Policies, PromptTemplate } from './types.js';

const DEFAULT_BATCH = 10;
const DEFAULT_REASON_TAGS = {
  pop: 'strong popularity signal',
  crit: 'strong critic signal',
  vis: 'visually rich signal (genre-based)',
  lowq: 'current file is 720p or below',
  weak: 'limited or low signal',
  mix: 'mixed signals',
  exceed: 'current file exceeds HD (2160p)'
};

const DEFAULT_POLICIES: Policies = {
  reasoning: {
    maxSentences: 2,
    forbidCurrentTrendsClaims: true,
    allowTimelessCulturalInference: true
  }
};

const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  prelude:
    'You are a Radarr quality profile decision agent. Respond ONLY with a single JSON object matching the schema. No markdown or code blocks. Use only the provided input JSON.',
  header:
    'Return keys: profile (one of {{allowedProfiles}}), rules (array using allowedReasons {{allowedReasons}}), reasoning (<= {{maxSentences}} sentences). Include popularityTier (low|mid|high) ONLY when popularityTierPolicy.allow is true. Do not include other keys.',
  constraints:
    'You are invoked only for ambiguous edge cases. Ground reasoning in provided fields/values (criticScore + criticScoreSource, popularity.primarySource/primaryScore/primaryVotes/computedPopularityIndex/rawPopularity, metacriticScore, rtAudienceScore, rtCriticScore, genres, currentQuality, mediaInfo, lowq, signalSummary). If signals are missing or weak, choose the safer lower profile and say "limited signal". Use reasonDescriptions to pick rule(s). Avoid claims about current trends or unseen formats.',
  inputs:
    'Input JSON includes title, year, genres, runtime, criticScore, criticScoreSource, popularity {primarySource, primaryScore, primaryVotes, tmdbScore, tmdbVotes, imdbScore, imdbVotes, computedPopularityIndex, rawPopularity}, metacriticScore, rtAudienceScore, rtAudienceVotes, rtCriticScore, rtCriticVotes, currentQuality, mediaInfo, lowq, thresholds, visualGenresHigh, signalSummary, policies, hints, popularityTierPolicy.allow. Base decisions only on these fields; if data is missing or weak, choose the safer lower profile.',
  popularityTierPolicy:
    'If popularityTierPolicy.allow is true, set popularityTier to low|mid|high using timeless popularity inference only. If false, omit popularityTier entirely.',
  groupsAndGenres:
    'Visual genres with high payoff: {{visualGenresHigh}}.'
};

function expandEnv(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  return val.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '');
}

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

function loadYaml(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf-8');
  const raw = parse(content);
  return deepExpand(raw);
}

function deriveRadarrUrl(rawUrl?: string): string {
  const inDocker = fs.existsSync('/.dockerenv');
  if (inDocker) {
    // If config points to localhost/127.x inside Docker, prefer service hostname
    if (!rawUrl || /(^https?:\/\/)?(localhost|127\.)/i.test(rawUrl)) {
      return 'http://radarr:7878';
    }
    return rawUrl;
  }

  if (rawUrl) return rawUrl;

  const host = process.env.LAN_HOSTNAME || process.env.HOST_IP || 'localhost';
  const port = process.env.RADARR_PORT || '3273';
  return `http://${host}${port ? `:${port}` : ''}`;
}

export function loadConfig(baseDir: string): BrokerConfig {
  const repoRoot = path.resolve(baseDir, '..');
  const dataConfig = path.join(repoRoot, 'data/quality-broker/config/config.yaml');
  const localConfig = path.join(baseDir, 'config/config.yaml');
  const exampleConfig = path.join(baseDir, 'config/config.example.yaml');
  const overridePath = process.env.QUALITY_BROKER_CONFIG;

  const candidates = [overridePath, dataConfig, localConfig, exampleConfig].filter(Boolean) as string[];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('No config file found for quality-broker. Provide config.yaml or set QUALITY_BROKER_CONFIG.');
  }

  const raw = loadYaml(found) as Partial<BrokerConfig>;

  const batchSize = Number(raw.batchSize || DEFAULT_BATCH);
  const decisionProfiles = raw.decisionProfiles || ['HD', 'Efficient-4K', 'HighQuality-4K'];
  const radarrApiKey = raw.radarr?.apiKey;
  if (!radarrApiKey) {
    throw new Error('Radarr API key is required in data/quality-broker/config/config.yaml.');
  }
  const policies: Policies = {
    reasoning: { ...DEFAULT_POLICIES.reasoning, ...(raw.policies?.reasoning || {}) }
  };

  const promptTemplate: PromptTemplate = {
    ...DEFAULT_PROMPT_TEMPLATE,
    ...(raw.promptTemplate || {})
  };

  const reasonTags = raw.reasonTags && Object.keys(raw.reasonTags).length ? raw.reasonTags : DEFAULT_REASON_TAGS;

  const llmPolicy: LLMPolicy = {
    enabled: raw.llmPolicy?.enabled !== false,
    useOnAmbiguousOnly: raw.llmPolicy?.useOnAmbiguousOnly !== false
  };

  const openaiApiKey = raw.openai?.apiKey && String(raw.openai.apiKey).trim();
  if (llmPolicy.enabled && !openaiApiKey) {
    throw new Error('OpenAI API key is required in data/quality-broker/config/config.yaml when LLM is enabled.');
  }

  const thresholds = raw.thresholds || {};
  const requiredThresholds: Array<keyof typeof thresholds> = [
    'criticHigh',
    'criticMid',
    'criticLow',
    'criticBlock',
    'popularityHigh',
    'popularityLow'
  ];
  for (const key of requiredThresholds) {
    if (typeof thresholds[key] !== 'number') {
      throw new Error(`Missing required thresholds.${key} in data/quality-broker/config/config.yaml.`);
    }
  }

  return {
    batchSize,
    radarr: {
      url: deriveRadarrUrl(raw.radarr?.url),
      apiKey: radarrApiKey
    },
    openai: {
      apiKey: openaiApiKey,
      model: raw.openai?.model || 'gpt-4.1',
      temperature: typeof raw.openai?.temperature === 'number' ? raw.openai.temperature : 0.15,
      maxTokens: typeof raw.openai?.maxTokens === 'number' ? raw.openai.maxTokens : 320
    },
    decisionProfiles,
    autoAssignProfile: raw.autoAssignProfile || 'AutoAssignQuality',
    reviseQualityForProfile: typeof raw.reviseQualityForProfile === 'string' ? raw.reviseQualityForProfile : '',
    promptHints: raw.promptHints || '',
    reasonTags,
    thresholds,
    visualGenresHigh: raw.visualGenresHigh,
    policies,
    promptTemplate,
    llmPolicy,
    downgradeQualityProfile: raw.downgradeQualityProfile === true
  };
}
