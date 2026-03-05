export const CLIENT_PROFILES = [
  {
    id: 'android_tv',
    label: 'Android TV / Google TV (default)',
    videoCodec: { av1: 'No hardware decode', hevc: 'Full', h264: 'Full' },
    dv: 'App-level via Jellyfin (Profile 5, Profile 8)',
    hint: 'Chromecast HD, older Android TV sticks. AV1 will be software-transcoded — use H264/HEVC files for best performance.',
  },
  {
    id: 'chromecast_4k',
    label: 'Chromecast with Google TV 4K (2022+)',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 8',
    hint: 'Full AV1 hardware decode. Dolby Vision Profile 5 and Profile 8 supported.',
  },
  {
    id: 'apple_tv',
    label: 'Apple TV 4K (3rd gen)',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 8 · No HDR10+',
    hint: 'Full AV1 hardware decode. Dolby Vision Profile 5/8 only — HDR10+ not supported.',
  },
  {
    id: 'shield',
    label: 'NVIDIA SHIELD',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 7, Profile 8',
    hint: 'Most capable TV client. Full AV1 hardware decode. Dolby Vision including Profile 7 (FEL) supported.',
  },
  {
    id: 'fire_tv',
    label: 'Fire TV Stick 4K Max',
    videoCodec: { av1: 'Software only', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 8 via Dolby MAL',
    hint: 'AV1 is software-decoded on most models — HEVC is preferred. Dolby Vision Profile 8 via MAL.',
  },
] as const;

export const SCOUT_MIN_QUALIFIERS_TOOLTIP = `Minimum qualifiers gate the Scout listing view.

Only titles meeting these thresholds appear in Scout Queue.
These are not release ranking scores and do not replace CF scoring.`;

export const SCOUT_CF_SCORING_TOOLTIP = `Scout release scoring (CF-style) is additive:
  Score = Resolution + Source + Codec + Protocol + Seeder bonus - Penalties

Resolution weights:
  2160p, 1080p, 720p
Source weights:
  Remux, BluRay, WEB-DL
Codec weights:
  HEVC, AV1, H264
Audio weights:
  Atmos, TrueHD, DTS, DD+/EAC3, AC3, AAC
Protocol weights:
  Usenet bonus, Torrent bonus
Penalties:
  Legacy codec penalty (xvid/mpeg4)
Bitrate gate:
  Hard exclude releases outside per-resolution Min/Max bitrate bands
Availability:
  Seeder bonus = floor(seeders / divisor), capped by max bonus

These settings affect Scout release ranking (search results), not the Library candidate priority score.`;

export const LEGACY_PENALTY_TOOLTIP = `Subtracts points from releases that use legacy codecs (xvid/mpeg4/mpeg2).

Higher value = stronger penalty (legacy files drop lower in Scout ranking).
Lower value = legacy files are penalized less.`;

export const SEEDER_DIVISOR_TOOLTIP = `Seeder bonus uses this formula:
  bonus = floor(seeders / divisor), then capped by "Seeder Max Bonus".

Lower divisor boosts seed-heavy torrents more aggressively.
Higher divisor makes seeders matter less in final score.`;

export const SEEDER_MAX_BONUS_TOOLTIP = `Caps how many points seeders can add to score.

Formula:
  seederBonus = floor(seeders / Seeder Divisor)
  finalSeederBonus = min(seederBonus, Seeder Max Bonus)

Example:
  divisor = 25, max bonus = 10
  80 seeders -> floor(80/25)=3 points
  500 seeders -> floor(500/25)=20 -> capped to 10 points

This prevents very high-seed releases from overpowering quality/source signals.`;

export const BITRATE_GATE_TOOLTIP = `Hard exclusion by estimated bitrate (size/duration) in Scout search results.

Each resolution has its own Min and Max bitrate.
Codec normalization is applied (AV1 lower band, H264 higher band) before filtering.

This avoids one global bitrate threshold across all formats.`;

export const BITRATE_PROFILE_DESCRIPTION =
  'Choose a bias profile to prefill recommended bitrate Min/Max gates by resolution. By default, WEB-DL bias is selected for storage efficiency.';

export const BITRATE_PREVIEW_MINUTES = 110;

export type BitrateProfileId = 'webdl' | 'bluray' | 'remux';

export type BitrateBandPreset = {
  min2160: string;
  max2160: string;
  min1080: string;
  max1080: string;
  min720: string;
  max720: string;
  minOther: string;
  maxOther: string;
};

export const BITRATE_BIAS_PROFILES: Array<{
  id: BitrateProfileId;
  label: string;
  summary: string;
  values: BitrateBandPreset;
}> = [
  {
    id: 'webdl',
    label: 'WEB-DL biased',
    summary: 'Balanced quality with storage efficiency.',
    values: {
      min2160: '10',
      max2160: '35',
      min1080: '4',
      max1080: '15',
      min720: '2.5',
      max720: '8',
      minOther: '1',
      maxOther: '12',
    },
  },
  {
    id: 'bluray',
    label: 'BluRay biased',
    summary: 'Higher quality headroom with larger files.',
    values: {
      min2160: '18',
      max2160: '70',
      min1080: '8',
      max1080: '35',
      min720: '4',
      max720: '16',
      minOther: '1',
      maxOther: '12',
    },
  },
  {
    id: 'remux',
    label: 'Remux biased',
    summary: 'Maximum quality targets and largest files.',
    values: {
      min2160: '35',
      max2160: '120',
      min1080: '18',
      max1080: '70',
      min720: '8',
      max720: '30',
      minOther: '1',
      maxOther: '12',
    },
  },
];

export const SCOUT_OBJECTIVE_SAMPLES = [
  'Keep 4K quality high, but avoid fake quality claims from unknown groups.',
  'Prioritize playback compatibility for Android TV and Chromecast devices.',
  'Prefer WEB-DL over WEBRip and reduce transcode-heavy picks.',
  'Storage-efficient upgrades: avoid oversized remux unless title is exceptional.',
  'Usenet-first policy with safe torrent fallback only when needed.',
] as const;

export const SCOUT_PRESET_SAMPLES: Array<{
  id: string;
  title: string;
  summary: string;
  objective: string;
  settingsPatch: Record<string, string>;
}> = [
  {
    id: 'balanced',
    title: 'Balanced 4K',
    summary: 'Quality-first, keeps strong penalties for legacy/suspicious releases.',
    objective: 'Balance 4K quality, authenticity, and compatibility.',
    settingsPatch: {
      scoutCfRes2160: '46',
      scoutCfSourceRemux: '34',
      scoutCfSourceBluray: '22',
      scoutCfSourceWebdl: '14',
      scoutCfLegacyPenalty: '40',
    },
  },
  {
    id: 'compat',
    title: 'Compatibility First',
    summary: 'De-prioritize AV1 and transcode-heavy outcomes for TV clients.',
    objective: 'Prioritize compatibility on Android TV / Google TV clients.',
    settingsPatch: {
      scoutCfCodecAv1: '6',
      scoutCfCodecH264: '14',
      scoutCfCodecHevc: '20',
    },
  },
  {
    id: 'storage',
    title: 'Storage Saver',
    summary: 'Reduce oversized upgrades while still targeting meaningful quality gains.',
    objective: 'Optimize for storage efficiency and practical upgrades.',
    settingsPatch: {
      scoutCfSourceRemux: '22',
      scoutCfSeedersBonusCap: '8',
    },
  },
];

export const LLM_RULESET_SAMPLES: Array<{ name: string; sentence: string }> = [
  {
    name: 'Prefer usenet in close ties',
    sentence: 'Prefer usenet in close ties.',
  },
  {
    name: 'Avoid uncertain AV1 compatibility',
    sentence: 'Avoid AV1 when compatibility is uncertain.',
  },
];

export interface OrderedScoreField {
  key: string;
  label: string;
}

export const RESOLUTION_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfRes2160', label: '2160p' },
  { key: 'scoutCfRes1080', label: '1080p' },
  { key: 'scoutCfRes720', label: '720p' },
];

export const SOURCE_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfSourceRemux', label: 'Remux' },
  { key: 'scoutCfSourceBluray', label: 'BluRay' },
  { key: 'scoutCfSourceWebdl', label: 'WEB-DL' },
];

export const VIDEO_CODEC_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfCodecHevc', label: 'HEVC' },
  { key: 'scoutCfCodecAv1', label: 'AV1' },
  { key: 'scoutCfCodecH264', label: 'H264' },
];

export const AUDIO_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfAudioAtmos', label: 'Atmos' },
  { key: 'scoutCfAudioTruehd', label: 'TrueHD' },
  { key: 'scoutCfAudioDts', label: 'DTS' },
  { key: 'scoutCfAudioDdp', label: 'DD+ / EAC3' },
  { key: 'scoutCfAudioAc3', label: 'AC3' },
  { key: 'scoutCfAudioAac', label: 'AAC' },
];

export const BITRATE_KEYS = {
  min2160: 'scoutCfBitrateMin2160Mbps',
  max2160: 'scoutCfBitrateMax2160Mbps',
  min1080: 'scoutCfBitrateMin1080Mbps',
  max1080: 'scoutCfBitrateMax1080Mbps',
  min720: 'scoutCfBitrateMin720Mbps',
  max720: 'scoutCfBitrateMax720Mbps',
  minOther: 'scoutCfBitrateMinOtherMbps',
  maxOther: 'scoutCfBitrateMaxOtherMbps',
} as const;
