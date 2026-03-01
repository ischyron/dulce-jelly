/**
 * Opinionated defaults for Curatarr.
 *
 * Philosophy:
 * - Primary clients are Android TV / Google TV → codec compat matters
 * - AV1 is emerging but not universally decoded in hardware on TV sticks
 * - HEVC is preferred for 4K/HDR; H264 is the safe universal fallback
 * - YTS groups produce small web-optimised encodes — good candidates for upgrade
 * - Dolby Vision P5/P8 need profile-aware clients; P7 requires FEL-capable hardware
 * - Scout targets: well-rated films currently at 1080p or below → upgrade to 2160p HEVC
 *
 * Seeding is idempotent — skips any setting / rule that already has a value.
 */

import os from 'node:os';
import path from 'node:path';
import type { CuratDb } from './client.js';

// ── Default settings ────────────────────────────────────────────────

const DEFAULT_SETTINGS: Record<string, string> = {
  /** Resolved at runtime to avoid hardcoding username */
  libraryPath: path.join(os.homedir(), 'Media', 'MEDIA1', 'Movies'),

  /** Scan workers — half of logical CPUs, capped at 8 */
  defaultJobs: String(Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2)))),

  /** Scout defaults (used as query params on /api/candidates) */
  scoutMinCritic: '65',          // Metacritic ≥ 65
  scoutMinCommunity: '7.0',      // IMDb ≥ 7.0
  scoutMaxResolution: '1080p',   // currently ≤ 1080p → candidate for 4K upgrade

  /**
   * Primary playback client profile.
   * Drives AV1 compat warnings, DV profile filtering, and codec scoring.
   *   'android_tv'  — Chromecast HD or older Android TV stick (no AV1 hardware decode)
   *   'shield'      — NVIDIA SHIELD — full AV1, all DV profiles
   *   'apple_tv'    — Apple TV 4K 3rd gen — AV1 + DV P5/P8, no P7
   *   'fire_tv'     — Fire TV Stick 4K Max — HEVC/H264, limited AV1
   */
  clientProfile: 'android_tv',
};

// ── Default quality rules ────────────────────────────────────────────

interface RuleSeed {
  category: string;
  name: string;
  enabled: boolean;
  priority: number;
  config: object;
}

const DEFAULT_RULES: RuleSeed[] = [
  // ── Client profiles ───────────────────────────────────────────────
  {
    category: 'profiles',
    name: 'Android TV / Google TV',
    enabled: true,
    priority: 0,
    config: {
      id: 'android_tv',
      maxResolution: '2160p',
      preferredCodecs: ['hevc', 'h264'],
      compatCodecs: ['hevc', 'h264', 'mpeg4'],
      av1Support: 'none',           // older sticks lack hardware AV1 decode
      hdrSupport: ['HDR10', 'HLG'],
      dvProfiles: [],               // DV requires extra licensing on AOSP
      notes: 'No AV1 hardware decode on most Chromecast/Android TV sticks. DV needs app-level support (e.g. Jellyfin Android with ExoPlayer).',
    },
  },
  {
    category: 'profiles',
    name: 'Chromecast with Google TV 4K',
    enabled: false,
    priority: 1,
    config: {
      id: 'chromecast_4k',
      maxResolution: '2160p',
      preferredCodecs: ['hevc', 'av1', 'h264'],
      compatCodecs: ['hevc', 'av1', 'h264'],
      av1Support: 'full',
      hdrSupport: ['HDR10', 'HDR10+', 'HLG', 'DolbyVision'],
      dvProfiles: [5, 8],
      notes: 'Chromecast HD and 4K (2022+) support AV1 and DV P8. P7 (FEL) not supported.',
    },
  },
  {
    category: 'profiles',
    name: 'NVIDIA SHIELD',
    enabled: false,
    priority: 2,
    config: {
      id: 'shield',
      maxResolution: '2160p',
      preferredCodecs: ['hevc', 'av1', 'h264'],
      compatCodecs: ['hevc', 'av1', 'h264', 'mpeg2video', 'mpeg4'],
      av1Support: 'full',
      hdrSupport: ['HDR10', 'HDR10+', 'HLG', 'DolbyVision'],
      dvProfiles: [5, 7, 8],
      notes: 'Most capable TV client. Full AV1, all DV profiles including P7 FEL.',
    },
  },
  {
    category: 'profiles',
    name: 'Apple TV 4K (3rd gen)',
    enabled: false,
    priority: 3,
    config: {
      id: 'apple_tv',
      maxResolution: '2160p',
      preferredCodecs: ['hevc', 'av1', 'h264'],
      compatCodecs: ['hevc', 'av1', 'h264'],
      av1Support: 'full',
      hdrSupport: ['HDR10', 'HLG', 'DolbyVision'],
      dvProfiles: [5, 8],
      notes: 'AV1 hardware decode. DV P5/P8 only. No P7 (FEL). No HDR10+.',
    },
  },

  // ── Release group tiers ───────────────────────────────────────────
  {
    category: 'groups',
    name: 'YTS / YIFY — Web-optimised',
    enabled: true,
    priority: 0,
    config: {
      groups: ['YTS.MX', 'YTS.AG', 'YTS.AM', 'YTS.LT', 'YIFY', 'YTS'],
      tier: 'web-opt',
      upgradeDesirable: true,
      notes: 'Small H264 encodes (typically 700MB–2GB). Good for 1080p viewing; prime candidates for 4K/HEVC upgrade when available.',
    },
  },
  {
    category: 'groups',
    name: '2160p scene groups',
    enabled: true,
    priority: 1,
    config: {
      groups: ['2160p_PiRaTeS', 'PAPARANDAZZO', 'iFT', 'MTeam', 'WiKi', 'FGT'],
      tier: '4k-scene',
      upgradeDesirable: false,
      notes: 'High-quality UHD encodes. Usually HEVC + HDR10. Keep if present.',
    },
  },
  {
    category: 'groups',
    name: 'Remux groups',
    enabled: true,
    priority: 2,
    config: {
      groups: ['FraMeSToR', 'SURCODE', 'decibeL', 'BMF', 'BeyondHD', 'KRaLiMaRKo'],
      tier: 'remux',
      upgradeDesirable: false,
      notes: 'Lossless disc remux — highest quality. Preserve always.',
    },
  },
  {
    category: 'groups',
    name: 'Streaming service groups',
    enabled: true,
    priority: 3,
    config: {
      groups: ['NTb', 'TEPES', 'playWEB', 'FLUX', 'MZABI', 'HANDJOB', 'TOMMY'],
      tier: 'web-dl',
      upgradeDesirable: false,
      notes: 'WEB-DL from NF/AMZN/ATVP — good quality HEVC, often HDR.',
    },
  },

  // ── Codec scoring ─────────────────────────────────────────────────
  {
    category: 'scoring',
    name: 'Codec quality weights',
    enabled: true,
    priority: 0,
    config: {
      weights: {
        av1:        100,   // best compression, emerging
        hevc:       90,    // preferred for 4K
        h264:       70,    // universal compat
        mpeg4:      40,    // old, avoid
        mpeg2video: 20,    // very old
        other:      30,
      },
      av1TvClientWarning: true,   // warn when active client profile doesn't support AV1
      notes: 'AV1 scores highest for compression efficiency but TV client compat must be checked.',
    },
  },
  {
    category: 'scoring',
    name: 'Resolution quality weights',
    enabled: true,
    priority: 1,
    config: {
      weights: {
        '2160p': 100,
        '1080p': 70,
        '720p':  40,
        '480p':  10,
        other:   20,
      },
    },
  },
  {
    category: 'scoring',
    name: 'HDR bonus',
    enabled: true,
    priority: 2,
    config: {
      bonuses: {
        DolbyVision: 15,
        'HDR10+':    10,
        HDR10:       8,
        HLG:         5,
      },
      dvProfilePenalty: {
        7: 5,    // P7 FEL — compatible with fewer clients, small penalty
      },
      notes: 'DV P7 (FEL) is only fully decoded on SHIELD/high-end setups.',
    },
  },
  {
    category: 'scoring',
    name: 'File size efficiency',
    enabled: true,
    priority: 3,
    config: {
      // MB/min thresholds — flag bloated or suspiciously small encodes
      redFlags: {
        tooSmall1080p: 50,    // < 50 MB/min for 1080p is suspiciously small
        tooLarge1080p: 400,   // > 400 MB/min for 1080p is likely a remux (fine)
        tooSmall2160p: 100,   // < 100 MB/min for 2160p is compressed/web
      },
    },
  },

  // ── Scout defaults ────────────────────────────────────────────────
  {
    category: 'scout',
    name: 'Upgrade priority targets',
    enabled: true,
    priority: 0,
    config: {
      // Surface these in the Scout Queue by default
      minCriticRating: 65,
      minCommunityRating: 7.0,
      maxCurrentResolution: '1080p',   // currently ≤ 1080p → upgrade candidate
      targetGroups: ['YTS.MX', 'YTS.AG', 'YTS.AM', 'YIFY', 'YTS'],
      // Desired upgrade target
      targetResolution: '2160p',
      targetCodec: 'hevc',
      limit: 200,
      notes: 'High-rated YTS movies currently at 1080p or lower. Prime candidates for 4K HEVC upgrade.',
    },
  },
  {
    category: 'scout',
    name: 'AV1 compatibility audit',
    enabled: true,
    priority: 1,
    config: {
      // Files to flag for review given Android TV default profile
      flagCodecs: ['av1'],
      reason: 'AV1 may not hardware-decode on Android TV sticks — check client compatibility',
      action: 'review',   // 'review' | 'replace' | 'ignore'
      notes: 'If primary client is Chromecast 4K (2022+) or SHIELD, disable this rule.',
    },
  },
  {
    category: 'scout',
    name: 'MPEG4/legacy codec replacement',
    enabled: true,
    priority: 2,
    config: {
      flagCodecs: ['mpeg4', 'mpeg2video', 'msmpeg4v3'],
      reason: 'Legacy codec — replace with H264 or HEVC for better client support and compression',
      action: 'replace',
    },
  },
];

// ── Seed function ────────────────────────────────────────────────────

export function seedDefaults(db: CuratDb): void {
  // Seed settings (skip existing)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!db.getSetting(key)) {
      db.setSetting(key, value);
    }
  }

  // Seed Jellyfin connection from env vars (if not already stored in DB)
  const envJellyfinUrl = process.env.JELLYFIN_URL ?? process.env.JELLYFIN_BASE_URL;
  if (envJellyfinUrl && !db.getSetting('jellyfinUrl')) {
    db.setSetting('jellyfinUrl', envJellyfinUrl);
  }
  const envJellyfinApiKey = process.env.JELLYFIN_API_KEY;
  if (envJellyfinApiKey && !db.getSetting('jellyfinApiKey')) {
    db.setSetting('jellyfinApiKey', envJellyfinApiKey);
  }

  // Seed rules (skip if any rules already exist in the category)
  const existingRules = db.getRules();
  const existingCategories = new Set(existingRules.map(r => r.category));

  for (const rule of DEFAULT_RULES) {
    if (!existingCategories.has(rule.category)) {
      db.upsertRule({
        category: rule.category,
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        config: rule.config,
      });
    }
  }
}
