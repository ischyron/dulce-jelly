import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { ProwlarrClient, type ProwlarrSearchResult } from '../../integrations/prowlarr/client.js';

interface ScoredRelease extends ProwlarrSearchResult {
  score: number;
  reasons: string[];
}
interface ScoutScoreConfig {
  res2160: number;
  res1080: number;
  res720: number;
  sourceRemux: number;
  sourceBluray: number;
  sourceWebdl: number;
  codecHevc: number;
  codecAv1: number;
  codecH264: number;
  audioAtmos: number;
  audioTruehd: number;
  audioDts: number;
  audioDdp: number;
  audioAc3: number;
  audioAac: number;
  legacyPenalty: number;
  small4kPenalty: number;
  small4kMinGiB: number;
  seedersDivisor: number;
  seedersBonusCap: number;
  usenetBonus: number;
  torrentBonus: number;
}

interface SearchSuccess {
  movieId: number;
  query: string;
  total: number;
  releases: ScoredRelease[];
  recommendation: ScoutRecommendation;
}

interface ScoutRecommendation {
  mode: 'tabulated';
  summary: string;
  best: ScoredRelease | null;
}

interface ScoutAutoRunResult {
  movieId: number;
  query?: string;
  total?: number;
  topTitle?: string;
  topScore?: number;
  error?: string;
}

export interface ScoutAutoRunSummary {
  trigger: 'manual' | 'scheduled';
  maxAllowed: number;
  requested: number;
  processed: number;
  skippedByCooldown: number;
  results: ScoutAutoRunResult[];
  startedAt: string;
  finishedAt: string;
}

export interface ScoutAutoState {
  running: boolean;
  lastRun: ScoutAutoRunSummary | null;
}

const autoState: ScoutAutoState = {
  running: false,
  lastRun: null,
};

const lastAutoSeenByMovie = new Map<number, number>();

function toText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

const DEFAULT_SCOUT_SCORE_CONFIG: ScoutScoreConfig = {
  res2160: 40,
  res1080: 25,
  res720: 10,
  sourceRemux: 28,
  sourceBluray: 16,
  sourceWebdl: 12,
  codecHevc: 20,
  codecAv1: 16,
  codecH264: 8,
  audioAtmos: 10,
  audioTruehd: 8,
  audioDts: 6,
  audioDdp: 5,
  audioAc3: 2,
  audioAac: 1,
  legacyPenalty: 30,
  small4kPenalty: 15,
  small4kMinGiB: 8,
  seedersDivisor: 20,
  seedersBonusCap: 12,
  usenetBonus: 10,
  torrentBonus: 0,
};

const TRASH_SCOUT_BASELINE_SETTINGS: Record<string, string> = {
  scoutCfRes2160: '46',
  scoutCfRes1080: '24',
  scoutCfRes720: '8',
  scoutCfSourceRemux: '34',
  scoutCfSourceBluray: '22',
  scoutCfSourceWebdl: '14',
  scoutCfCodecHevc: '22',
  scoutCfCodecAv1: '12',
  scoutCfCodecH264: '6',
  scoutCfAudioAtmos: '10',
  scoutCfAudioTruehd: '8',
  scoutCfAudioDts: '6',
  scoutCfAudioDdp: '5',
  scoutCfAudioAc3: '2',
  scoutCfAudioAac: '1',
  scoutCfLegacyPenalty: '40',
  scoutCfSmall4kPenalty: '20',
  scoutCfSmall4kMinGiB: '10',
  scoutCfSeedersDivisor: '25',
  scoutCfSeedersBonusCap: '10',
  scoutCfUsenetBonus: '10',
  scoutCfTorrentBonus: '0',
};

interface ScoutRuleSeed {
  name: string;
  priority: number;
  config: Record<string, unknown>;
}

const SCOUT_RULE_BASELINE: ScoutRuleSeed[] = [
  {
    name: 'Avoid quality downgrade',
    priority: 10,
    config: {
      kind: 'hard_filter',
      description: 'Drop results whose resolution tier is lower than current file tier.',
      enabledWhen: { sameMovie: true },
    },
  },
  {
    name: 'Prefer WEB-DL over WEBRip at same tier',
    priority: 11,
    config: {
      kind: 'tiebreaker',
      when: 'same_resolution',
      prefer: 'webdl',
      over: 'webrip',
      reason: 'WEB-DL is direct source; WEBRip is re-encode.',
    },
  },
  {
    name: 'Prefer verified groups in close-score ties',
    priority: 12,
    config: {
      kind: 'tiebreaker',
      thresholdDelta: 250,
      prefer: 'verified_group',
      over: 'unknown_group',
      reason: 'Reduces fake-quality and mislabeled encodes.',
    },
  },
  {
    name: 'Prefer lower playback-risk in close-score ties',
    priority: 13,
    config: {
      kind: 'tiebreaker',
      thresholdDelta: 200,
      prefer: 'lower_playback_risk',
      reason: 'Avoid high transcode load and weak client compatibility.',
    },
  },
  {
    name: 'Prefer DD+/EAC3 over DTS-HD MA in close-score ties',
    priority: 14,
    config: {
      kind: 'tiebreaker',
      thresholdDelta: 200,
      prefer: ['dd+', 'eac3'],
      over: ['dts-hd-ma'],
      reason: 'Better passthrough compatibility on common TV clients.',
    },
  },
  {
    name: 'Prefer Dolby Vision in close-score ties',
    priority: 15,
    config: {
      kind: 'tiebreaker',
      thresholdDelta: 300,
      prefer: 'dolby_vision',
      guard: 'skip_if_non_high_repute_remux',
      reason: 'DV is meaningful when source integrity is reliable.',
    },
  },
  {
    name: 'Prefer original-language releases over dub-only',
    priority: 16,
    config: {
      kind: 'hard_filter',
      description: 'Drop releases that do not include original-language audio when original-language options exist.',
    },
  },
  {
    name: 'De-prioritize AV1 for weak client support',
    priority: 17,
    config: {
      kind: 'tiebreaker',
      condition: 'client_profile_without_av1_hw_decode',
      penaltyHint: 'codec_av1',
      reason: 'Avoid avoidable transcode load.',
    },
  },
  {
    name: 'Usenet-first within comparable quality bands',
    priority: 18,
    config: {
      kind: 'tiebreaker',
      thresholdDelta: 200,
      prefer: 'usenet',
      over: 'torrent',
      reason: 'Improves reliability in typical stacks.',
    },
  },
  {
    name: 'Escalate exceptional titles for remux review',
    priority: 19,
    config: {
      kind: 'escalation',
      trigger: 'mc>=85_and_high_repute_remux_available',
      action: 'manual_confirm',
      reason: 'Landmark titles can justify remux despite storage cost.',
    },
  },
];

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function applySettings(db: CuratDb, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    db.setSetting(key, value);
  }
}

function ensureScoutRuleBaseline(db: CuratDb): number[] {
  const existing = db.getRules('scout');
  const existingByName = new Map(existing.map(r => [r.name, r]));
  const saved: number[] = [];
  for (const seed of SCOUT_RULE_BASELINE) {
    const prev = existingByName.get(seed.name);
    const id = db.upsertRule({
      id: prev?.id,
      category: 'scout',
      name: seed.name,
      enabled: prev ? prev.enabled !== 0 : true,
      priority: prev?.priority ?? seed.priority,
      config: prev ? safeParseJson(prev.config) as object : seed.config,
    });
    saved.push(id);
  }
  return saved;
}

async function fetchTrashGuidesRevision(): Promise<{ source: string; revision: string | null; fetchedAt: string; warning?: string }> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      'https://api.github.com/repos/TRaSH-Guides/Guides/commits?path=docs/json/radarr/custom-formats&per_page=1',
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'curatarr-scout-sync' } },
    );
    if (!res.ok) {
      return {
        source: 'TRaSH-Guides',
        revision: null,
        fetchedAt,
        warning: `revision_lookup_failed_${res.status}`,
      };
    }
    const body = await res.json() as Array<{ sha?: string }>;
    return {
      source: 'TRaSH-Guides',
      revision: body?.[0]?.sha?.slice(0, 12) ?? null,
      fetchedAt,
    };
  } catch (err) {
    return {
      source: 'TRaSH-Guides',
      revision: null,
      fetchedAt,
      warning: `revision_lookup_failed_${(err as Error).message}`,
    };
  }
}

function buildScoutRefinementDraft(
  db: CuratDb,
  objective: string,
): {
  mode: 'heuristic';
  objective: string;
  prompt: string;
  proposedSettings: Record<string, string>;
  suggestedRuleToggles: Array<{ id: number; name: string; enabled: boolean }>;
} {
  const normalized = objective.toLowerCase();
  const proposedSettings: Record<string, string> = {};
  const rules = db.getRules('scout');
  const toggles: Array<{ id: number; name: string; enabled: boolean }> = [];

  if (/\b(storage|size|efficient|space|compact)\b/.test(normalized)) {
    proposedSettings.scoutCfSourceRemux = '24';
    proposedSettings.scoutCfSmall4kPenalty = '26';
    proposedSettings.scoutCfSmall4kMinGiB = '12';
  }
  if (/\b(quality|cinema|reference|best|archive)\b/.test(normalized)) {
    proposedSettings.scoutCfSourceRemux = '40';
    proposedSettings.scoutCfSourceBluray = '26';
    proposedSettings.scoutCfRes2160 = '52';
    proposedSettings.scoutCfSmall4kPenalty = '12';
  }
  if (/\b(compat|android|chromecast|transcode|playback)\b/.test(normalized)) {
    proposedSettings.scoutCfCodecAv1 = '6';
    proposedSettings.scoutCfCodecH264 = '14';
    for (const rule of rules) {
      if (rule.name.toLowerCase().includes('av1 compatibility audit')) {
        toggles.push({ id: rule.id, name: rule.name, enabled: true });
      }
    }
  }
  if (/\b(torrent)\b/.test(normalized) && !/\b(usenet)\b/.test(normalized)) {
    proposedSettings.scoutCfTorrentBonus = '8';
    proposedSettings.scoutCfUsenetBonus = '0';
  }
  if (/\b(usenet)\b/.test(normalized) && !/\b(torrent)\b/.test(normalized)) {
    proposedSettings.scoutCfUsenetBonus = '12';
    proposedSettings.scoutCfTorrentBonus = '-2';
  }

  const scoreCfg = resolveScoutScoreConfig(db);
  const compactRules = rules.map(r => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled !== 0,
    priority: r.priority,
    config: safeParseJson(r.config),
  }));

  const prompt = [
    'You are refining Curatarr Scout rules and CF scoring.',
    `Goal: ${objective || 'No explicit goal provided; refine for balanced quality + compatibility.'}`,
    'Current CF settings:',
    JSON.stringify(scoreCfg, null, 2),
    'Current Scout rules:',
    JSON.stringify(compactRules, null, 2),
    'Return JSON with keys: settingsPatch (string values), rulePatches (id/name/enabled/priority/config), rationale.',
    'Preserve safety guardrails: no quality downgrades, keep legacy codec penalty non-zero, keep batch safety cap untouched.',
  ].join('\n');

  return {
    mode: 'heuristic',
    objective,
    prompt,
    proposedSettings,
    suggestedRuleToggles: toggles,
  };
}

function intSetting(db: CuratDb, key: string, fallback: number, min: number, max: number): number {
  const raw = parseInt(db.getSetting(key) ?? '', 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function floatSetting(db: CuratDb, key: string, fallback: number, min: number, max: number): number {
  const raw = parseFloat(db.getSetting(key) ?? '');
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function resolveScoutScoreConfig(db: CuratDb): ScoutScoreConfig {
  return {
    res2160: intSetting(db, 'scoutCfRes2160', DEFAULT_SCOUT_SCORE_CONFIG.res2160, -200, 200),
    res1080: intSetting(db, 'scoutCfRes1080', DEFAULT_SCOUT_SCORE_CONFIG.res1080, -200, 200),
    res720: intSetting(db, 'scoutCfRes720', DEFAULT_SCOUT_SCORE_CONFIG.res720, -200, 200),
    sourceRemux: intSetting(db, 'scoutCfSourceRemux', DEFAULT_SCOUT_SCORE_CONFIG.sourceRemux, -200, 200),
    sourceBluray: intSetting(db, 'scoutCfSourceBluray', DEFAULT_SCOUT_SCORE_CONFIG.sourceBluray, -200, 200),
    sourceWebdl: intSetting(db, 'scoutCfSourceWebdl', DEFAULT_SCOUT_SCORE_CONFIG.sourceWebdl, -200, 200),
    codecHevc: intSetting(db, 'scoutCfCodecHevc', DEFAULT_SCOUT_SCORE_CONFIG.codecHevc, -200, 200),
    codecAv1: intSetting(db, 'scoutCfCodecAv1', DEFAULT_SCOUT_SCORE_CONFIG.codecAv1, -200, 200),
    codecH264: intSetting(db, 'scoutCfCodecH264', DEFAULT_SCOUT_SCORE_CONFIG.codecH264, -200, 200),
    audioAtmos: intSetting(db, 'scoutCfAudioAtmos', DEFAULT_SCOUT_SCORE_CONFIG.audioAtmos, -200, 200),
    audioTruehd: intSetting(db, 'scoutCfAudioTruehd', DEFAULT_SCOUT_SCORE_CONFIG.audioTruehd, -200, 200),
    audioDts: intSetting(db, 'scoutCfAudioDts', DEFAULT_SCOUT_SCORE_CONFIG.audioDts, -200, 200),
    audioDdp: intSetting(db, 'scoutCfAudioDdp', DEFAULT_SCOUT_SCORE_CONFIG.audioDdp, -200, 200),
    audioAc3: intSetting(db, 'scoutCfAudioAc3', DEFAULT_SCOUT_SCORE_CONFIG.audioAc3, -200, 200),
    audioAac: intSetting(db, 'scoutCfAudioAac', DEFAULT_SCOUT_SCORE_CONFIG.audioAac, -200, 200),
    legacyPenalty: intSetting(db, 'scoutCfLegacyPenalty', DEFAULT_SCOUT_SCORE_CONFIG.legacyPenalty, 0, 400),
    small4kPenalty: intSetting(db, 'scoutCfSmall4kPenalty', DEFAULT_SCOUT_SCORE_CONFIG.small4kPenalty, 0, 400),
    small4kMinGiB: floatSetting(db, 'scoutCfSmall4kMinGiB', DEFAULT_SCOUT_SCORE_CONFIG.small4kMinGiB, 0.5, 60),
    seedersDivisor: intSetting(db, 'scoutCfSeedersDivisor', DEFAULT_SCOUT_SCORE_CONFIG.seedersDivisor, 1, 500),
    seedersBonusCap: intSetting(db, 'scoutCfSeedersBonusCap', DEFAULT_SCOUT_SCORE_CONFIG.seedersBonusCap, 0, 200),
    usenetBonus: intSetting(db, 'scoutCfUsenetBonus', DEFAULT_SCOUT_SCORE_CONFIG.usenetBonus, -200, 200),
    torrentBonus: intSetting(db, 'scoutCfTorrentBonus', DEFAULT_SCOUT_SCORE_CONFIG.torrentBonus, -200, 200),
  };
}

function scoreRelease(r: ProwlarrSearchResult, cfg: ScoutScoreConfig): ScoredRelease {
  const t = r.title.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (/\b2160p\b|\b4k\b/.test(t)) { score += cfg.res2160; reasons.push('2160p'); }
  else if (/\b1080p\b/.test(t)) { score += cfg.res1080; reasons.push('1080p'); }
  else if (/\b720p\b/.test(t)) { score += cfg.res720; reasons.push('720p'); }

  if (/\b(remux)\b/.test(t)) { score += cfg.sourceRemux; reasons.push('remux'); }
  else if (/\bbluray\b|\bbd\b/.test(t)) { score += cfg.sourceBluray; reasons.push('bluray'); }
  else if (/\bweb-?dl\b/.test(t)) { score += cfg.sourceWebdl; reasons.push('web-dl'); }

  if (/\bhevc\b|\bx265\b/.test(t)) { score += cfg.codecHevc; reasons.push('hevc'); }
  else if (/\bav1\b/.test(t)) { score += cfg.codecAv1; reasons.push('av1'); }
  else if (/\bh264\b|\bx264\b/.test(t)) { score += cfg.codecH264; reasons.push('h264'); }

  if (/\batmos\b/.test(t)) {
    score += cfg.audioAtmos;
    reasons.push('atmos');
  }
  if (/\btruehd\b/.test(t)) {
    score += cfg.audioTruehd;
    reasons.push('truehd');
  } else if (/\bdts(?:-?hd|-?x)?\b/.test(t)) {
    score += cfg.audioDts;
    reasons.push('dts');
  } else if (/\be-?ac-?3\b|\bddp\b|\bdd\+\b/.test(t)) {
    score += cfg.audioDdp;
    reasons.push('ddp/eac3');
  } else if (/\bac-?3\b/.test(t)) {
    score += cfg.audioAc3;
    reasons.push('ac3');
  } else if (/\baac\b/.test(t)) {
    score += cfg.audioAac;
    reasons.push('aac');
  }

  if (/\bxvid\b|\bmpeg4\b/.test(t)) { score -= cfg.legacyPenalty; reasons.push('legacy codec penalty'); }

  const min4kSizeBytes = Math.round(cfg.small4kMinGiB * 1024 * 1024 * 1024);
  if (r.size && /\b2160p\b|\b4k\b/.test(t) && r.size < min4kSizeBytes) {
    score -= cfg.small4kPenalty;
    reasons.push('small-for-4k penalty');
  }

  if (r.seeders != null) {
    score += Math.min(cfg.seedersBonusCap, Math.max(0, Math.floor(r.seeders / cfg.seedersDivisor)));
  }

  if (r.protocol === 'usenet') {
    score += cfg.usenetBonus;
    reasons.push('usenet preference');
  } else if (r.protocol === 'torrent') {
    score += cfg.torrentBonus;
    reasons.push('torrent preference');
  }

  return { ...r, score, reasons };
}

function resolveProwlarrConfig(db: CuratDb): { url: string; apiKey: string } | null {
  const url = db.getSetting('prowlarrUrl') ?? process.env.PROWLARR_URL ?? '';
  const apiKey = db.getSetting('prowlarrApiKey') ?? process.env.PROWLARR_API_KEY ?? '';
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

function configuredBatchCap(db: CuratDb): number {
  const raw = parseInt(db.getSetting('scoutSearchBatchSize') ?? '10', 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(10, raw));
}

function recommendationSummary(top: ScoredRelease | null): string {
  if (!top) return 'No efficient path could be computed from the available releases.';
  const reasons = top.reasons.length > 0 ? top.reasons.join(', ') : 'balanced quality and availability';
  return `Best path: "${top.title}" (score ${top.score}) driven by ${reasons}.`;
}

async function searchOneMovie(db: CuratDb, client: ProwlarrClient, movieId: number, queryOverride?: string): Promise<SearchSuccess> {
  const movie = db.getMovieById(movieId);
  if (!movie) throw new Error('movie_not_found');
  const title = movie.jellyfin_title ?? movie.parsed_title ?? movie.folder_name;
  const year = movie.jellyfin_year ?? movie.parsed_year;
  const query = toText(queryOverride).trim() || [title, year].filter(Boolean).join(' ');
  const scoreCfg = resolveScoutScoreConfig(db);

  const releases = await client.searchMovie(query);
  const scored = releases.map(r => scoreRelease(r, scoreCfg)).sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  return {
    movieId,
    query,
    total: scored.length,
    releases: scored,
    recommendation: {
      mode: 'tabulated',
      summary: recommendationSummary(best),
      best,
    },
  };
}

function toPriorityScore(mc: number | null, imdb: number | null): number {
  return Math.round((mc ?? 0) * 0.4 + (imdb ?? 0) * 6);
}

function configuredCooldownMin(db: CuratDb): number {
  const raw = parseInt(db.getSetting('scoutAutoCooldownMin') ?? '240', 10);
  if (!Number.isFinite(raw)) return 240;
  return Math.max(5, Math.min(24 * 60, raw));
}

function pickAutoMovieIds(db: CuratDb, cap: number): { ids: number[]; skippedByCooldown: number } {
  const minCritic = parseFloat(db.getSetting('scoutMinCritic') ?? '65');
  const minCommunity = parseFloat(db.getSetting('scoutMinCommunity') ?? '7.0');
  const maxResolution = db.getSetting('scoutMaxResolution') ?? '1080p';
  const pool = db.getUpgradeCandidates({
    maxResolution,
    minCriticRating: Number.isFinite(minCritic) ? minCritic : 65,
    minCommunityRating: Number.isFinite(minCommunity) ? minCommunity : 7.0,
    limit: 250,
  });

  const now = Date.now();
  const cooldownMs = configuredCooldownMin(db) * 60_000;
  const byPriority = pool
    .map(c => ({ id: c.id, priority: toPriorityScore(c.critic_rating, c.community_rating) }))
    .sort((a, b) => b.priority - a.priority);

  let skippedByCooldown = 0;
  const ids: number[] = [];
  for (const row of byPriority) {
    const seenAt = lastAutoSeenByMovie.get(row.id) ?? 0;
    if (now - seenAt < cooldownMs) {
      skippedByCooldown++;
      continue;
    }
    ids.push(row.id);
    if (ids.length >= cap) break;
  }
  return { ids, skippedByCooldown };
}

export function getScoutAutoState(): ScoutAutoState {
  return autoState;
}

export async function runScoutAutoBatch(
  db: CuratDb,
  trigger: 'manual' | 'scheduled',
): Promise<ScoutAutoRunSummary> {
  if (autoState.running) {
    throw new Error('auto_scout_already_running');
  }
  autoState.running = true;
  const startedAt = new Date().toISOString();
  try {
    const cfg = resolveProwlarrConfig(db);
    if (!cfg) throw new Error('prowlarr_not_configured');

    const cap = configuredBatchCap(db);
    const { ids, skippedByCooldown } = pickAutoMovieIds(db, cap);
    const client = new ProwlarrClient(cfg.url, cfg.apiKey);
    const results: ScoutAutoRunResult[] = [];

    for (const movieId of ids) {
      try {
        const one = await searchOneMovie(db, client, movieId);
        const top = one.releases[0];
        results.push({
          movieId,
          query: one.query,
          total: one.total,
          topTitle: top?.title,
          topScore: top?.score,
        });
      } catch (err) {
        results.push({ movieId, error: (err as Error).message });
      } finally {
        lastAutoSeenByMovie.set(movieId, Date.now());
      }
    }

    const summary: ScoutAutoRunSummary = {
      trigger,
      maxAllowed: cap,
      requested: ids.length,
      processed: results.length,
      skippedByCooldown,
      results,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    autoState.lastRun = summary;
    return summary;
  } finally {
    autoState.running = false;
  }
}

export function makeScoutRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/scout/sync-trash-scores
  app.post('/sync-trash-scores', async (c) => {
    applySettings(db, TRASH_SCOUT_BASELINE_SETTINGS);
    const savedRuleIds = ensureScoutRuleBaseline(db);
    const meta = await fetchTrashGuidesRevision();
    applySettings(db, {
      scoutTrashSyncSource: meta.source,
      scoutTrashSyncRevision: meta.revision ?? '',
      scoutTrashSyncedAt: meta.fetchedAt,
    });
    return c.json({
      applied: TRASH_SCOUT_BASELINE_SETTINGS,
      syncedRules: savedRuleIds.length,
      meta,
    });
  });

  // POST /api/scout/rules/refine-draft  { objective: string }
  app.post('/rules/refine-draft', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { objective?: unknown };
    const objective = toText(body.objective).trim();
    const draft = buildScoutRefinementDraft(db, objective);
    return c.json(draft);
  });

  // POST /api/scout/search-one  { movieId: number, query?: string }
  app.post('/search-one', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { movieId?: unknown; query?: unknown };
    const movieId = Number(body.movieId);
    if (!Number.isFinite(movieId) || movieId <= 0) {
      return c.json({ error: 'invalid_movie_id' }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) {
      return c.json({ error: 'prowlarr_not_configured' }, 422);
    }

    try {
      const client = new ProwlarrClient(cfg.url, cfg.apiKey);
      const result = await searchOneMovie(db, client, movieId, toText(body.query));
      return c.json(result);
    } catch (err) {
      if ((err as Error).message === 'movie_not_found') {
        return c.json({ error: 'movie_not_found' }, 404);
      }
      return c.json({ error: 'prowlarr_search_failed', detail: (err as Error).message }, 502);
    }
  });

  // POST /api/scout/search-batch  { movieIds: number[] }
  app.post('/search-batch', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { movieIds?: unknown; batchSize?: unknown };
    const movieIdsRaw = Array.isArray(body.movieIds) ? body.movieIds : [];
    const movieIds = Array.from(new Set(
      movieIdsRaw.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0)
    ));
    if (movieIds.length === 0) return c.json({ error: 'movie_ids_required' }, 400);
    if (movieIds.length > 10) return c.json({ error: 'batch_limit_exceeded', max: 10 }, 400);

    const cap = configuredBatchCap(db);
    if (movieIds.length > cap) {
      return c.json({ error: 'batch_limit_exceeded', max: cap }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) return c.json({ error: 'prowlarr_not_configured' }, 422);

    const client = new ProwlarrClient(cfg.url, cfg.apiKey);
    const results: Array<{ movieId: number; query?: string; total?: number; releases?: ScoredRelease[]; error?: string }> = [];
    let processed = 0;

    for (const movieId of movieIds) {
      try {
        const one = await searchOneMovie(db, client, movieId);
        results.push(one);
      } catch (err) {
        results.push({ movieId, error: (err as Error).message });
      }
      processed++;
    }

    return c.json({ processed, maxAllowed: cap, results });
  });

  // POST /api/scout/auto-run  {}
  app.post('/auto-run', async (c) => {
    try {
      const summary = await runScoutAutoBatch(db, 'manual');
      return c.json(summary);
    } catch (err) {
      const code = (err as Error).message === 'prowlarr_not_configured' ? 422 : 409;
      return c.json({ error: (err as Error).message }, code);
    }
  });

  // GET /api/scout/auto-status
  app.get('/auto-status', (c) => {
    return c.json(getScoutAutoState());
  });

  return app;
}
