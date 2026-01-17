import fs from 'fs';
import path from 'path';

import { parse } from 'yaml';

import { BrokerConfig } from './types.js';

const DEFAULT_BATCH = 10;

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
  const openaiApiKey = raw.openai?.apiKey && String(raw.openai.apiKey).trim();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key is required in data/quality-broker/config/config.yaml.');
  }

  return {
    batchSize,
    radarr: {
      url: deriveRadarrUrl(raw.radarr?.url),
      apiKey: radarrApiKey
    },
    openai: {
      apiKey: openaiApiKey,
      model: raw.openai?.model || 'gpt-4-turbo'
    },
    decisionProfiles,
    autoAssignProfile: raw.autoAssignProfile || 'AutoAssignQuality',
    promptHints: raw.promptHints || '',
    remuxPenalty: raw.remuxPenalty || 'Remux is fully blocked (score -1000, size cap 1MB/min).',
    reasonTags: raw.reasonTags || ['popular', 'criticScore', 'visual', 'lowq']
  };
}
