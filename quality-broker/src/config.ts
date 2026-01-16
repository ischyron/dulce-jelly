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
  if (!raw.radarr?.url) {
    throw new Error('radarr.url is required in config.yaml');
  }

  const batchSize = Number(raw.batchSize || DEFAULT_BATCH);
  const decisionProfiles = raw.decisionProfiles || ['HD', 'Efficient-4K', 'HighQuality-4K'];
  return {
    batchSize,
    radarr: raw.radarr,
    openai: {
      apiKey: raw.openai?.apiKey || process.env.OPENAI_API_KEY,
      model: raw.openai?.model || 'gpt-4-turbo'
    },
    decisionProfiles,
    autoAssignProfile: raw.autoAssignProfile || 'AutoAssignQuality',
    promptHints: raw.promptHints || '',
    remuxPenalty: raw.remuxPenalty || 'Remux is fully blocked (score -1000, size cap 1MB/min).'
  };
}
