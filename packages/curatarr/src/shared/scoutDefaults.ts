import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const SCOUT_SETTING_KEYS = [
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
  'scoutCfSeedersDivisor',
  'scoutCfSeedersBonusCap',
  'scoutCfUsenetBonus',
  'scoutCfTorrentBonus',
] as const;

export type ScoutSettingKey = typeof SCOUT_SETTING_KEYS[number];

type ScoutYamlDoc = {
  llm?: {
    provider?: string;
    apiKeyEnv?: string;
  };
  scoutDefaults?: Record<string, string | number>;
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
  scoutCfSeedersDivisor: '25',
  scoutCfSeedersBonusCap: '10',
  scoutCfUsenetBonus: '10',
  scoutCfTorrentBonus: '0',
};

let cached: ScoutYamlDoc | null = null;

function scoringYamlPath(): string {
  const configured = process.env.CURATARR_SCORING_FILE?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'config', 'scoring.yaml');
}

function loadDoc(): ScoutYamlDoc {
  if (cached) return cached;
  const p = scoringYamlPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    cached = (YAML.parse(raw) ?? {}) as ScoutYamlDoc;
  } catch {
    cached = {};
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
  const doc = loadDoc();
  const provider = (doc.llm?.provider ?? '').trim().toLowerCase();
  return provider || 'openai';
}
