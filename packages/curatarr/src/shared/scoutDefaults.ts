import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const SCOUT_SETTING_KEYS = [
  'scoutPipelineBasicResolutionScore',
  'scoutPipelineBasicVideoScore',
  'scoutPipelineBasicAudioScore',
  'scoutPipelineBitrateTargetMbps',
  'scoutPipelineBitrateTolerancePct',
  'scoutPipelineBitrateMaxScore',
  'scoutPipelineTrashRes2160',
  'scoutPipelineTrashRes1080',
  'scoutPipelineTrashRes720',
  'scoutPipelineTrashSourceRemux',
  'scoutPipelineTrashSourceBluray',
  'scoutPipelineTrashSourceWebdl',
  'scoutPipelineTrashCodecHevc',
  'scoutPipelineTrashCodecAv1',
  'scoutPipelineTrashCodecH264',
  'scoutPipelineTrashAudioAtmos',
  'scoutPipelineTrashAudioTruehd',
  'scoutPipelineTrashAudioDts',
  'scoutPipelineTrashAudioDdp',
  'scoutPipelineTrashAudioAc3',
  'scoutPipelineTrashAudioAac',
  'scoutPipelineTrashLegacyPenalty',
  'scoutPipelineTrashSeedersDivisor',
  'scoutPipelineTrashSeedersBonusCap',
  'scoutPipelineTrashUsenetBonus',
  'scoutPipelineTrashTorrentBonus',
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
  scoutPipelineBasicResolutionScore: '6',
  scoutPipelineBasicVideoScore: '5',
  scoutPipelineBasicAudioScore: '4',
  scoutPipelineBitrateTargetMbps: '18',
  scoutPipelineBitrateTolerancePct: '40',
  scoutPipelineBitrateMaxScore: '12',
  scoutPipelineTrashRes2160: '46',
  scoutPipelineTrashRes1080: '24',
  scoutPipelineTrashRes720: '8',
  scoutPipelineTrashSourceRemux: '30',
  scoutPipelineTrashSourceBluray: '20',
  scoutPipelineTrashSourceWebdl: '14',
  scoutPipelineTrashCodecHevc: '22',
  scoutPipelineTrashCodecAv1: '10',
  scoutPipelineTrashCodecH264: '8',
  scoutPipelineTrashAudioAtmos: '10',
  scoutPipelineTrashAudioTruehd: '8',
  scoutPipelineTrashAudioDts: '6',
  scoutPipelineTrashAudioDdp: '5',
  scoutPipelineTrashAudioAc3: '2',
  scoutPipelineTrashAudioAac: '1',
  scoutPipelineTrashLegacyPenalty: '40',
  scoutPipelineTrashSeedersDivisor: '25',
  scoutPipelineTrashSeedersBonusCap: '10',
  scoutPipelineTrashUsenetBonus: '10',
  scoutPipelineTrashTorrentBonus: '0',
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
