import type { BitrateProfileId, OrderedScoreField } from '../content';
import { BITRATE_BIAS_PROFILES, BITRATE_KEYS } from '../content';
import type { SettingsForm } from '../types';

const same = (a: string | undefined, b: string): boolean => {
  const av = Number(a ?? '');
  const bv = Number(b);
  return Number.isFinite(av) && Number.isFinite(bv) && Math.abs(av - bv) < 0.001;
};

export function detectBitrateProfileFromSettings(current: SettingsForm): BitrateProfileId | null {
  for (const profile of BITRATE_BIAS_PROFILES) {
    const v = profile.values;
    if (
      same(current[BITRATE_KEYS.min2160], v.min2160) &&
      same(current[BITRATE_KEYS.max2160], v.max2160) &&
      same(current[BITRATE_KEYS.min1080], v.min1080) &&
      same(current[BITRATE_KEYS.max1080], v.max1080) &&
      same(current[BITRATE_KEYS.min720], v.min720) &&
      same(current[BITRATE_KEYS.max720], v.max720) &&
      same(current[BITRATE_KEYS.minOther], v.minOther) &&
      same(current[BITRATE_KEYS.maxOther], v.maxOther)
    ) {
      return profile.id;
    }
  }
  return null;
}

export function parseScore(value: string | undefined): number {
  const n = Number(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function rankByScore(order: string[], fields: OrderedScoreField[], form: SettingsForm): string[] {
  const allowed = new Set(fields.map((f) => f.key));
  const base = order.filter((k) => allowed.has(k));
  return [...base].sort((a, b) => {
    const diff = parseScore(form[b]) - parseScore(form[a]);
    if (diff !== 0) return diff;
    return base.indexOf(a) - base.indexOf(b);
  });
}
