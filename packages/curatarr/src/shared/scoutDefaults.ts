import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const SCOUT_SETTING_KEYS = [
  'scoutCfRes2160',
  'scoutCfRes1080',
  'scoutCfRes720',
  'scoutCfSourceRemux',
  'scoutCfSourceBluray',
  'scoutCfSourceWebdl',
  'scoutCfCodecHevc',
  'scoutCfCodecAv1',
  'scoutCfCodecH264',
  'scoutCfAudioAtmos',
  'scoutCfAudioTruehd',
  'scoutCfAudioDts',
  'scoutCfAudioDdp',
  'scoutCfAudioAc3',
  'scoutCfAudioAac',
  'scoutCfLegacyPenalty',
  'scoutCfSmall4kPenalty',
  'scoutCfSmall4kMinGiB',
  'scoutCfBitrateMin2160Mbps',
  'scoutCfBitrateMax2160Mbps',
  'scoutCfBitrateMin1080Mbps',
  'scoutCfBitrateMax1080Mbps',
  'scoutCfBitrateMin720Mbps',
  'scoutCfBitrateMax720Mbps',
  'scoutCfBitrateMinOtherMbps',
  'scoutCfBitrateMaxOtherMbps',
  'scoutCfSeedersDivisor',
  'scoutCfSeedersBonusCap',
  'scoutCfUsenetBonus',
  'scoutCfTorrentBonus',
] as const;

export type ScoutSettingKey = typeof SCOUT_SETTING_KEYS[number];

type ScoutYamlDoc = {
  scoutDefaults?: Record<string, string | number>;
};

type SecretsYamlDoc = {
  llm?: {
    provider?: string;
  };
};

const FALLBACK_SCOUT_DEFAULTS: Record<ScoutSettingKey, string> = {
  scoutCfRes2160: '46',
  scoutCfRes1080: '24',
  scoutCfRes720: '8',
  scoutCfSourceRemux: '30',
  scoutCfSourceBluray: '20',
  scoutCfSourceWebdl: '14',
  scoutCfCodecHevc: '22',
  scoutCfCodecAv1: '10',
  scoutCfCodecH264: '8',
  scoutCfAudioAtmos: '10',
  scoutCfAudioTruehd: '8',
  scoutCfAudioDts: '6',
  scoutCfAudioDdp: '5',
  scoutCfAudioAc3: '2',
  scoutCfAudioAac: '1',
  scoutCfLegacyPenalty: '40',
  scoutCfSmall4kPenalty: '22',
  scoutCfSmall4kMinGiB: '10',
  scoutCfBitrateMin2160Mbps: '14',
  scoutCfBitrateMax2160Mbps: '120',
  scoutCfBitrateMin1080Mbps: '6',
  scoutCfBitrateMax1080Mbps: '60',
  scoutCfBitrateMin720Mbps: '3',
  scoutCfBitrateMax720Mbps: '30',
  scoutCfBitrateMinOtherMbps: '1',
  scoutCfBitrateMaxOtherMbps: '20',
  scoutCfSeedersDivisor: '25',
  scoutCfSeedersBonusCap: '10',
  scoutCfUsenetBonus: '10',
  scoutCfTorrentBonus: '0',
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
