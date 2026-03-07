import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const SCOUT_SETTING_KEYS = [
  'scoutPipelineBasicRes2160',
  'scoutPipelineBasicRes1080',
  'scoutPipelineBasicRes720',
  'scoutPipelineBasicSourceRemux',
  'scoutPipelineBasicSourceBluray',
  'scoutPipelineBasicSourceWebdl',
  'scoutPipelineBasicVideoHevc',
  'scoutPipelineBasicVideoAv1',
  'scoutPipelineBasicVideoH264',
  'scoutPipelineBasicAudioAtmos',
  'scoutPipelineBasicAudioTruehd',
  'scoutPipelineBasicAudioDts',
  'scoutPipelineBasicAudioDdp',
  'scoutPipelineBasicAudioAc3',
  'scoutPipelineBasicAudioAac',
  'scoutPipelineBitrateTargetMbps',
  'scoutPipelineBitrateTolerancePct',
  'scoutPipelineBitrateMaxScore',
  'scoutPipelineBasicLegacyPenalty',
  'scoutPipelineBasicSeedersDivisor',
  'scoutPipelineBasicSeedersBonusCap',
  'scoutPipelineBasicUsenetBonus',
  'scoutPipelineBasicTorrentBonus',
  'scoutPipelineLlmTieDelta',
  'scoutPipelineLlmWeakDropDelta',
] as const;

export type ScoutSettingKey = (typeof SCOUT_SETTING_KEYS)[number];

type ScoutYamlDoc = {
  scoutDefaults?: Record<string, string | number>;
};

type SecretsYamlDoc = {
  llm?: {
    provider?: string;
  };
};

const FALLBACK_SCOUT_DEFAULTS: Record<ScoutSettingKey, string> = {
  scoutPipelineBasicRes2160: '46',
  scoutPipelineBasicRes1080: '24',
  scoutPipelineBasicRes720: '8',
  scoutPipelineBasicSourceRemux: '30',
  scoutPipelineBasicSourceBluray: '20',
  scoutPipelineBasicSourceWebdl: '14',
  scoutPipelineBasicVideoHevc: '22',
  scoutPipelineBasicVideoAv1: '10',
  scoutPipelineBasicVideoH264: '8',
  scoutPipelineBasicAudioAtmos: '10',
  scoutPipelineBasicAudioTruehd: '8',
  scoutPipelineBasicAudioDts: '6',
  scoutPipelineBasicAudioDdp: '5',
  scoutPipelineBasicAudioAc3: '2',
  scoutPipelineBasicAudioAac: '1',
  scoutPipelineBitrateTargetMbps: '18',
  scoutPipelineBitrateTolerancePct: '40',
  scoutPipelineBitrateMaxScore: '12',
  scoutPipelineBasicLegacyPenalty: '40',
  scoutPipelineBasicSeedersDivisor: '25',
  scoutPipelineBasicSeedersBonusCap: '10',
  scoutPipelineBasicUsenetBonus: '10',
  scoutPipelineBasicTorrentBonus: '0',
  scoutPipelineLlmTieDelta: '10',
  scoutPipelineLlmWeakDropDelta: '40',
};

let cached: ScoutYamlDoc | null = null;

function configSearchPaths(file: string): string[] {
  const cwd = process.cwd();
  return [
    path.resolve('/config', file),
    path.resolve(cwd, 'config', file),
    path.resolve(cwd, 'data', 'curatarr', 'config', file),
  ];
}

function firstExistingPath(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
}

export function scoringYamlPath(): string {
  return firstExistingPath(configSearchPaths('scoring.yaml'));
}

function loadDoc(): ScoutYamlDoc {
  if (cached) return cached;
  const p = scoringYamlPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    cached = (YAML.parse(raw) ?? {}) as ScoutYamlDoc;
    if (!cached.scoutDefaults || Object.keys(cached.scoutDefaults).length === 0) {
      cached.scoutDefaults = { ...FALLBACK_SCOUT_DEFAULTS };
    }
  } catch {
    cached = {
      scoutDefaults: { ...FALLBACK_SCOUT_DEFAULTS },
    };
  }
  return cached;
}

export function getScoutDefaultSettings(): Record<ScoutSettingKey, string> {
  const doc = loadDoc();
  const defaults = doc.scoutDefaults ?? {};
  const out: Partial<Record<ScoutSettingKey, string>> = {};
  for (const key of SCOUT_SETTING_KEYS) {
    const raw = defaults[key];
    out[key] = raw == null ? FALLBACK_SCOUT_DEFAULTS[key] : String(raw);
  }
  return out as Record<ScoutSettingKey, string>;
}

export function getDefaultLlmProvider(): string {
  const provider = readLlmProviderFromSecrets();
  return provider || 'openai';
}

export function syncScoringYamlFromSettings(settings: Record<string, string>): void {
  const current = loadDoc();
  const nextDefaults: Record<string, string> = {};
  for (const key of SCOUT_SETTING_KEYS) {
    const fromSettings = settings[key];
    if (fromSettings != null && String(fromSettings).trim() !== '') {
      nextDefaults[key] = String(fromSettings);
      continue;
    }
    const fromYaml = current.scoutDefaults?.[key];
    nextDefaults[key] = fromYaml == null ? FALLBACK_SCOUT_DEFAULTS[key] : String(fromYaml);
  }

  const out: ScoutYamlDoc = {
    scoutDefaults: nextDefaults,
  };
  const p = scoringYamlPath();
  const yamlText = YAML.stringify(out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, yamlText, 'utf8');
  cached = out;
}

function secretsYamlPath(): string {
  return firstExistingPath(configSearchPaths('secrets.yaml'));
}

function readLlmProviderFromSecrets(): string {
  const p = secretsYamlPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = (YAML.parse(raw) ?? {}) as SecretsYamlDoc;
    return (parsed.llm?.provider ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
}
