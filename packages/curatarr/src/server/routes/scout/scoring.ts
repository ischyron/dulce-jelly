import type { CuratDb } from '../../../db/client.js';
import type { ProwlarrSearchResult } from '../../../integrations/prowlarr/client.js';
import { getScoutDefaultSettings } from '../../../shared/scoutDefaults.js';
import type {
  DroppedRelease,
  ScoredRelease,
  ScoutBlockerRule,
  ScoutCustomCfRule,
  ScoutLlmRule,
  ScoutScoreConfig,
} from './types.js';

function toInt(raw: string | undefined, fallback: number): number {
  const v = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

function toFloat(raw: string | undefined, fallback: number): number {
  const v = Number.parseFloat(raw ?? '');
  return Number.isFinite(v) ? v : fallback;
}

const SCOUT_DEFAULT_SETTINGS = getScoutDefaultSettings();

const DEFAULT_SCOUT_SCORE_CONFIG: ScoutScoreConfig = {
  bitrateTargetMbps: toFloat(SCOUT_DEFAULT_SETTINGS.scoutPipelineBitrateTargetMbps, 18),
  bitrateTolerancePct: toFloat(SCOUT_DEFAULT_SETTINGS.scoutPipelineBitrateTolerancePct, 40),
  bitrateMaxScore: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBitrateMaxScore, 12),
  res2160: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicRes2160, 46),
  res1080: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicRes1080, 24),
  res720: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicRes720, 8),
  sourceRemux: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicSourceRemux, 30),
  sourceBluray: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicSourceBluray, 20),
  sourceWebdl: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicSourceWebdl, 14),
  codecHevc: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicVideoHevc, 22),
  codecAv1: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicVideoAv1, 10),
  codecH264: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicVideoH264, 8),
  audioAtmos: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioAtmos, 10),
  audioTruehd: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioTruehd, 8),
  audioDts: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioDts, 6),
  audioDdp: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioDdp, 5),
  audioAc3: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioAc3, 2),
  audioAac: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicAudioAac, 1),
  legacyPenalty: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicLegacyPenalty, 40),
  seedersDivisor: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicSeedersDivisor, 25),
  seedersBonusCap: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicSeedersBonusCap, 10),
  usenetBonus: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicUsenetBonus, 10),
  torrentBonus: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineBasicTorrentBonus, 0),
  llmTieDelta: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineLlmTieDelta, 10),
  llmWeakDropDelta: toInt(SCOUT_DEFAULT_SETTINGS.scoutPipelineLlmWeakDropDelta, 40),
};

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function intSetting(db: CuratDb, key: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(db.getSetting(key) ?? '', 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function floatSetting(db: CuratDb, key: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseFloat(db.getSetting(key) ?? '');
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

export function resolveScoutScoreConfig(db: CuratDb): ScoutScoreConfig {
  return {
    bitrateTargetMbps: floatSetting(
      db,
      'scoutPipelineBitrateTargetMbps',
      DEFAULT_SCOUT_SCORE_CONFIG.bitrateTargetMbps,
      1,
      200,
    ),
    bitrateTolerancePct: floatSetting(
      db,
      'scoutPipelineBitrateTolerancePct',
      DEFAULT_SCOUT_SCORE_CONFIG.bitrateTolerancePct,
      1,
      200,
    ),
    bitrateMaxScore: intSetting(db, 'scoutPipelineBitrateMaxScore', DEFAULT_SCOUT_SCORE_CONFIG.bitrateMaxScore, 0, 200),
    res2160: intSetting(db, 'scoutPipelineBasicRes2160', DEFAULT_SCOUT_SCORE_CONFIG.res2160, -200, 200),
    res1080: intSetting(db, 'scoutPipelineBasicRes1080', DEFAULT_SCOUT_SCORE_CONFIG.res1080, -200, 200),
    res720: intSetting(db, 'scoutPipelineBasicRes720', DEFAULT_SCOUT_SCORE_CONFIG.res720, -200, 200),
    sourceRemux: intSetting(db, 'scoutPipelineBasicSourceRemux', DEFAULT_SCOUT_SCORE_CONFIG.sourceRemux, -200, 200),
    sourceBluray: intSetting(db, 'scoutPipelineBasicSourceBluray', DEFAULT_SCOUT_SCORE_CONFIG.sourceBluray, -200, 200),
    sourceWebdl: intSetting(db, 'scoutPipelineBasicSourceWebdl', DEFAULT_SCOUT_SCORE_CONFIG.sourceWebdl, -200, 200),
    codecHevc: intSetting(db, 'scoutPipelineBasicVideoHevc', DEFAULT_SCOUT_SCORE_CONFIG.codecHevc, -200, 200),
    codecAv1: intSetting(db, 'scoutPipelineBasicVideoAv1', DEFAULT_SCOUT_SCORE_CONFIG.codecAv1, -200, 200),
    codecH264: intSetting(db, 'scoutPipelineBasicVideoH264', DEFAULT_SCOUT_SCORE_CONFIG.codecH264, -200, 200),
    audioAtmos: intSetting(db, 'scoutPipelineBasicAudioAtmos', DEFAULT_SCOUT_SCORE_CONFIG.audioAtmos, -200, 200),
    audioTruehd: intSetting(db, 'scoutPipelineBasicAudioTruehd', DEFAULT_SCOUT_SCORE_CONFIG.audioTruehd, -200, 200),
    audioDts: intSetting(db, 'scoutPipelineBasicAudioDts', DEFAULT_SCOUT_SCORE_CONFIG.audioDts, -200, 200),
    audioDdp: intSetting(db, 'scoutPipelineBasicAudioDdp', DEFAULT_SCOUT_SCORE_CONFIG.audioDdp, -200, 200),
    audioAc3: intSetting(db, 'scoutPipelineBasicAudioAc3', DEFAULT_SCOUT_SCORE_CONFIG.audioAc3, -200, 200),
    audioAac: intSetting(db, 'scoutPipelineBasicAudioAac', DEFAULT_SCOUT_SCORE_CONFIG.audioAac, -200, 200),
    legacyPenalty: intSetting(db, 'scoutPipelineBasicLegacyPenalty', DEFAULT_SCOUT_SCORE_CONFIG.legacyPenalty, 0, 400),
    seedersDivisor: intSetting(
      db,
      'scoutPipelineBasicSeedersDivisor',
      DEFAULT_SCOUT_SCORE_CONFIG.seedersDivisor,
      1,
      500,
    ),
    seedersBonusCap: intSetting(
      db,
      'scoutPipelineBasicSeedersBonusCap',
      DEFAULT_SCOUT_SCORE_CONFIG.seedersBonusCap,
      0,
      200,
    ),
    usenetBonus: intSetting(db, 'scoutPipelineBasicUsenetBonus', DEFAULT_SCOUT_SCORE_CONFIG.usenetBonus, -200, 200),
    torrentBonus: intSetting(db, 'scoutPipelineBasicTorrentBonus', DEFAULT_SCOUT_SCORE_CONFIG.torrentBonus, -200, 200),
    llmTieDelta: intSetting(db, 'scoutPipelineLlmTieDelta', DEFAULT_SCOUT_SCORE_CONFIG.llmTieDelta, 0, 100),
    llmWeakDropDelta: intSetting(
      db,
      'scoutPipelineLlmWeakDropDelta',
      DEFAULT_SCOUT_SCORE_CONFIG.llmWeakDropDelta,
      0,
      300,
    ),
  };
}

export function addBasicFormatScore(
  r: ProwlarrSearchResult,
  cfg: ScoutScoreConfig,
  runtimeSec: number | null,
): ScoredRelease {
  const t = r.title.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (/\b2160p\b|\b4k\b/.test(t)) {
    score += cfg.res2160;
    reasons.push('basic:resolution:2160p');
  } else if (/\b1080p\b/.test(t)) {
    score += cfg.res1080;
    reasons.push('basic:resolution:1080p');
  } else if (/\b720p\b/.test(t)) {
    score += cfg.res720;
    reasons.push('basic:resolution:720p');
  }

  if (/\bhevc\b|\bx265\b/.test(t)) {
    score += cfg.codecHevc;
    reasons.push('basic:video:hevc');
  } else if (/\bav1\b/.test(t)) {
    score += cfg.codecAv1;
    reasons.push('basic:video:av1');
  } else if (/\bh264\b|\bx264\b/.test(t)) {
    score += cfg.codecH264;
    reasons.push('basic:video:h264');
  }

  if (/\batmos\b/.test(t)) {
    score += cfg.audioAtmos;
    reasons.push('basic:audio:atmos');
  } else if (/\btruehd\b/.test(t)) {
    score += cfg.audioTruehd;
    reasons.push('basic:audio:truehd');
  } else if (/\bdts(?:-?hd|-?x)?\b/.test(t)) {
    score += cfg.audioDts;
    reasons.push('basic:audio:dts');
  } else if (/\be-?ac-?3\b|\bddp\b|\bdd\+\b/.test(t)) {
    score += cfg.audioDdp;
    reasons.push('basic:audio:ddp/eac3');
  } else if (/\bac-?3\b/.test(t)) {
    score += cfg.audioAc3;
    reasons.push('basic:audio:ac3');
  } else if (/\baac\b/.test(t)) {
    score += cfg.audioAac;
    reasons.push('basic:audio:aac');
  }

  if (/\b(remux)\b/.test(t)) {
    score += cfg.sourceRemux;
    reasons.push('basic:source:remux');
  } else if (/\bblu[- .]?ray\b|\bbd(?:rip)?\b|\bbrrip\b/.test(t)) {
    score += cfg.sourceBluray;
    reasons.push('basic:source:bluray');
  } else if (/\bweb-?dl\b|\bweb[- .]?rip\b/.test(t)) {
    score += cfg.sourceWebdl;
    reasons.push('basic:source:web-dl');
  }

  if (runtimeSec && runtimeSec > 0 && r.size && r.size > 0) {
    const estimatedMbps = (r.size * 8) / runtimeSec / 1_000_000;
    const distanceRatio = Math.abs(estimatedMbps - cfg.bitrateTargetMbps) / Math.max(cfg.bitrateTargetMbps, 0.1);
    const toleranceRatio = Math.max(0.01, cfg.bitrateTolerancePct / 100);
    const alignment = Math.max(0, 1 - Math.min(1, distanceRatio / toleranceRatio));
    const bitrateScore = Math.round(cfg.bitrateMaxScore * alignment);
    if (bitrateScore > 0) {
      score += bitrateScore;
      reasons.push(`basic:bitrate(${bitrateScore})`);
    }
  }

  return { ...r, score, reasons };
}

export function loadScoutCustomCfRules(db: CuratDb): ScoutCustomCfRule[] {
  const rows = db.getRules('scout_custom_cf').filter((r) => r.enabled !== 0);
  const out: ScoutCustomCfRule[] = [];
  for (const row of rows) {
    const cfg = safeParseJson(row.config) as Record<string, unknown>;
    const matchType = cfg.matchType === 'regex' ? 'regex' : 'string';
    const pattern = typeof cfg.pattern === 'string' ? cfg.pattern : '';
    const score = Number(cfg.score ?? 0);
    const flagsRaw = typeof cfg.flags === 'string' ? cfg.flags : 'i';
    const flags = flagsRaw.includes('i') ? 'i' : '';
    const appliesTo = cfg.appliesTo === 'full' ? 'full' : 'title';
    if (!pattern.trim() || !Number.isFinite(score)) continue;
    out.push({
      id: row.id,
      name: row.name,
      pattern: pattern.trim(),
      score,
      matchType,
      flags,
      appliesTo,
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

export function applyCustomCfRules(
  release: ProwlarrSearchResult,
  rules: ScoutCustomCfRule[],
): { delta: number; reasons: string[]; matchedRuleIds: number[] } {
  let delta = 0;
  const reasons: string[] = [];
  const matchedRuleIds: number[] = [];
  const text = release.title ?? '';
  for (const rule of rules) {
    const target = rule.appliesTo === 'full' ? text : text;
    let matched = false;
    if (rule.matchType === 'regex') {
      try {
        matched = new RegExp(rule.pattern, rule.flags).test(target);
      } catch {
        matched = false;
      }
    } else {
      matched = target.toLowerCase().includes(rule.pattern.toLowerCase());
    }
    if (!matched) continue;
    delta += rule.score;
    matchedRuleIds.push(rule.id);
    reasons.push(`custom_cf:${rule.name} (${rule.score >= 0 ? '+' : ''}${rule.score})`);
  }
  return { delta, reasons, matchedRuleIds };
}

export function loadScoutLlmRules(db: CuratDb): ScoutLlmRule[] {
  return db
    .getRules('scout_llm_ruleset')
    .filter((r) => r.enabled !== 0)
    .map((r) => {
      const cfg = safeParseJson(r.config) as Record<string, unknown>;
      const sentence =
        typeof cfg.sentence === 'string'
          ? cfg.sentence
          : typeof cfg.description === 'string'
            ? cfg.description
            : r.name;
      return {
        id: r.id,
        priority: r.priority,
        sentence: sentence.trim(),
      };
    })
    .filter((r) => r.sentence.length > 0)
    .sort((a, b) => a.priority - b.priority || a.id - b.id);
}

export function loadScoutBlockerRules(db: CuratDb): ScoutBlockerRule[] {
  const rows = db.getRules('scout_release_blockers').filter((r) => r.enabled !== 0);
  const out: ScoutBlockerRule[] = [];
  for (const row of rows) {
    const cfg = safeParseJson(row.config) as Record<string, unknown>;
    const matchType = cfg.matchType === 'regex' ? 'regex' : 'string';
    const pattern = typeof cfg.pattern === 'string' ? cfg.pattern.trim() : '';
    if (!pattern) continue;
    out.push({
      id: row.id,
      name: row.name,
      enabled: row.enabled !== 0,
      priority: row.priority,
      matchType,
      flags: typeof cfg.flags === 'string' ? cfg.flags : 'i',
      appliesTo: cfg.appliesTo === 'full' ? 'full' : 'title',
      pattern,
      reason: typeof cfg.reason === 'string' && cfg.reason.trim() ? cfg.reason.trim() : 'Blocked by custom rule',
    });
  }
  return out.sort((a, b) => a.priority - b.priority || a.id - b.id);
}

export function applyBlockerRules(
  releases: ScoredRelease[],
  blockers: ScoutBlockerRule[],
): { finals: ScoredRelease[]; dropped: DroppedRelease[] } {
  if (blockers.length === 0) return { finals: releases, dropped: [] };
  const finals: ScoredRelease[] = [];
  const dropped: DroppedRelease[] = [];
  for (const rel of releases) {
    let dropReason: string | null = null;
    for (const rule of blockers) {
      const target = rule.appliesTo === 'full' ? rel.title : rel.title;
      let matched = false;
      if (rule.matchType === 'regex') {
        try {
          matched = new RegExp(rule.pattern, rule.flags.includes('i') ? 'i' : '').test(target);
        } catch {
          matched = false;
        }
      } else {
        matched = target.toLowerCase().includes(rule.pattern.toLowerCase());
      }
      if (matched) {
        dropReason = `Blocked: ${rule.reason}`;
        break;
      }
    }
    if (dropReason) {
      dropped.push({ ...rel, droppedReason: dropReason });
    } else {
      finals.push(rel);
    }
  }
  return { finals, dropped };
}

export function applyLlmRuleset(
  releases: ScoredRelease[],
  llmRules: ScoutLlmRule[],
  _cfg: ScoutScoreConfig,
): { finals: ScoredRelease[]; dropped: DroppedRelease[] } {
  // Step 5 is currently stored/configurable but execution is intentionally disabled
  // until true provider-backed LLM ranking is implemented.
  if (llmRules.length === 0) return { finals: [...releases].sort((a, b) => b.score - a.score), dropped: [] };
  return { finals: [...releases].sort((a, b) => b.score - a.score), dropped: [] };
}

export function applyTopPercentileGate(
  releases: ScoredRelease[],
  keepRatio: number,
): { finals: ScoredRelease[]; dropped: DroppedRelease[] } {
  if (releases.length === 0) return { finals: [], dropped: [] };
  const ratio = Math.max(0, Math.min(1, keepRatio));
  const keepCount = Math.max(1, Math.ceil(releases.length * ratio));
  const sorted = [...releases].sort((a, b) => b.score - a.score);
  const finals = sorted.slice(0, keepCount);
  const dropped = sorted.slice(keepCount).map((r) => ({
    ...r,
    droppedReason: 'Dropped by percentile gate (outside top 10%).',
  }));
  return { finals, dropped };
}

export function applyLlmSingleCandidateGate(
  releases: ScoredRelease[],
  llmRules: ScoutLlmRule[],
): { finals: ScoredRelease[]; dropped: DroppedRelease[] } {
  if (llmRules.length === 0 || releases.length <= 1) return { finals: releases, dropped: [] };
  const sorted = [...releases].sort((a, b) => b.score - a.score);
  const finals = sorted.slice(0, 1);
  const dropped = sorted.slice(1).map((r) => ({
    ...r,
    droppedReason: 'Dropped by LLM single-candidate enforcement.',
  }));
  return { finals, dropped };
}
