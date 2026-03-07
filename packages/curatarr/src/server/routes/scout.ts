import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { ProwlarrClient, type ProwlarrSearchResult } from '../../integrations/prowlarr/client.js';
import * as scoutCache from './scout/cache.js';
import { listScoutRules, replaceScoutRuleCategory } from './scout/rulesDomain.js';
import * as scoutScoring from './scout/scoring.js';
import type { DroppedRelease, ScoredRelease, ScoutScoreConfig, SearchSuccess } from './scout/types.js';

const TRASH_SYNC_MODEL_VERSION = '2026-03-07-v2';

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
const scoutSearchCache = new Map<string, scoutCache.ScoutCacheEntry>();

function toText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

interface ScoutRuleSeed {
  name: string;
  priority: number;
  config: Record<string, unknown>;
  enabled?: boolean;
}

const SCOUT_LLM_RULESET_BASELINE: ScoutRuleSeed[] = [
  {
    name: 'Flag exceptional titles for Remux review',
    priority: 1,
    enabled: false,
    config: {
      sentence:
        'When deterministic scores are close, flag true cultural-landmark titles where Remux is justified and ask for explicit confirmation before selecting it.',
    },
  },
  {
    name: 'Prefer original-language audio in close ties',
    priority: 2,
    enabled: false,
    config: {
      sentence:
        'For non-English originals, prefer releases that include the original language audio track, and rank dub-only releases lower when tie-break decisions are needed.',
    },
  },
];

interface TrashUpstreamFileSnapshot {
  name: string;
  size: number;
  downloadUrl: string;
  parsedJson?: unknown;
  warning?: string;
}

interface TrashUpstreamSnapshot {
  path: string;
  fileCount: number;
  truncated: boolean;
  files: TrashUpstreamFileSnapshot[];
}

interface TrashSyncDetailsResponse {
  meta: {
    source: string;
    revision: string | null;
    modelVersion: string;
    mappingRevision: string;
    syncedAt: string | null;
    rulesSynced: number;
    warning?: string;
  };
  upstream: TrashUpstreamSnapshot | null;
}

interface ScoutTrashParityDiff {
  added: Array<{ name: string; score: number }>;
  removed: Array<{ name: string; score: number }>;
  changed: Array<{ name: string; before: number; after: number }>;
}

interface ScoutTrashParityResponse {
  state: 'in_sync' | 'drifted' | 'unknown';
  checkedAt: string;
  reason?: string;
  baselineCount: number;
  currentCount: number;
  diff: ScoutTrashParityDiff;
}

interface RadarrCfScoreItem {
  name: string;
  score: number;
}

interface ScoutCustomCfRule {
  id: number;
  name: string;
  pattern: string;
  score: number;
  matchType: 'regex' | 'string';
  flags: string;
  appliesTo: 'title' | 'full';
}

interface ScoutLlmRule {
  id: number;
  priority: number;
  sentence: string;
}

const SCOUT_CUSTOM_CF_BASELINE: ScoutRuleSeed[] = [
  {
    name: 'Trusted Remux group boost',
    priority: 1,
    enabled: false,
    config: {
      matchType: 'regex',
      pattern: '\\b(framestor|cinephiles)\\b',
      score: 8,
      flags: 'i',
      appliesTo: 'title',
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

function resolveRadarrConfig(db: CuratDb): { url: string; apiKey: string } | null {
  const url = db.getSetting('radarrUrl') ?? '';
  const apiKey = db.getSetting('radarrApiKey') ?? '';
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

async function fetchRadarrCustomFormatScores(url: string, apiKey: string): Promise<RadarrCfScoreItem[]> {
  const base = url.replace(/\/+$/, '');
  const headers = { 'X-Api-Key': apiKey, Accept: 'application/json' };
  const [cfRes, qpRes] = await Promise.all([
    fetch(`${base}/api/v3/customformat`, { headers }),
    fetch(`${base}/api/v3/qualityprofile`, { headers }),
  ]);
  if (!cfRes.ok) throw new Error(`radarr_customformat_${cfRes.status}`);
  if (!qpRes.ok) throw new Error(`radarr_qualityprofile_${qpRes.status}`);
  const customFormats = (await cfRes.json().catch(() => [])) as Array<{ id?: number; name?: string }>;
  const profiles = (await qpRes.json().catch(() => [])) as Array<{
    formatItems?: Array<{ format?: number; score?: number }>;
  }>;
  const nameById = new Map<number, string>();
  for (const cf of customFormats) {
    if (typeof cf.id === 'number' && typeof cf.name === 'string' && cf.name.trim()) {
      nameById.set(cf.id, cf.name.trim());
    }
  }
  const scoreByName = new Map<string, number>();
  for (const profile of profiles) {
    for (const item of profile.formatItems ?? []) {
      const id = typeof item.format === 'number' ? item.format : Number.NaN;
      const name = nameById.get(id);
      if (!name) continue;
      const score = Number(item.score ?? 0);
      if (!Number.isFinite(score)) continue;
      const prev = scoreByName.get(name);
      if (prev == null || Math.abs(score) > Math.abs(prev)) {
        scoreByName.set(name, score);
      }
    }
  }
  return Array.from(scoreByName.entries())
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function diffParity(baseline: RadarrCfScoreItem[], current: RadarrCfScoreItem[]): ScoutTrashParityDiff {
  const prev = new Map(baseline.map((x) => [x.name, x.score]));
  const now = new Map(current.map((x) => [x.name, x.score]));
  const added: Array<{ name: string; score: number }> = [];
  const removed: Array<{ name: string; score: number }> = [];
  const changed: Array<{ name: string; before: number; after: number }> = [];
  for (const [name, score] of now.entries()) {
    if (!prev.has(name)) {
      added.push({ name, score });
      continue;
    }
    const before = prev.get(name) ?? 0;
    if (before !== score) changed.push({ name, before, after: score });
  }
  for (const [name, score] of prev.entries()) {
    if (!now.has(name)) removed.push({ name, score });
  }
  return { added, removed, changed };
}

function getStoredRadarrBaseline(db: CuratDb): RadarrCfScoreItem[] {
  return parseJsonSetting<RadarrCfScoreItem[]>(db, 'scoutTrashRadarrSnapshotJson', []);
}

async function refreshTrashParity(db: CuratDb): Promise<ScoutTrashParityResponse> {
  const checkedAt = new Date().toISOString();
  const cfg = resolveRadarrConfig(db);
  if (!cfg) {
    const out: ScoutTrashParityResponse = {
      state: 'unknown',
      checkedAt,
      reason: 'radarr_not_configured',
      baselineCount: 0,
      currentCount: 0,
      diff: { added: [], removed: [], changed: [] },
    };
    applySettings(db, {
      scoutTrashParityState: out.state,
      scoutTrashParityCheckedAt: checkedAt,
      scoutTrashParityDiffJson: JSON.stringify(out.diff),
      scoutTrashParityReason: out.reason ?? '',
    });
    return out;
  }
  try {
    const baseline = getStoredRadarrBaseline(db);
    const current = await fetchRadarrCustomFormatScores(cfg.url, cfg.apiKey);
    if (baseline.length === 0) {
      const out: ScoutTrashParityResponse = {
        state: 'unknown',
        checkedAt,
        reason: 'baseline_not_captured',
        baselineCount: 0,
        currentCount: current.length,
        diff: { added: [], removed: [], changed: [] },
      };
      applySettings(db, {
        scoutTrashParityState: out.state,
        scoutTrashParityCheckedAt: checkedAt,
        scoutTrashParityDiffJson: JSON.stringify(out.diff),
        scoutTrashParityReason: out.reason ?? '',
      });
      return out;
    }
    const diff = diffParity(baseline, current);
    const drifted = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;
    const out: ScoutTrashParityResponse = {
      state: drifted ? 'drifted' : 'in_sync',
      checkedAt,
      baselineCount: baseline.length,
      currentCount: current.length,
      diff,
    };
    applySettings(db, {
      scoutTrashParityState: out.state,
      scoutTrashParityCheckedAt: checkedAt,
      scoutTrashParityDiffJson: JSON.stringify(out.diff),
      scoutTrashParityReason: '',
    });
    return out;
  } catch (err) {
    const out: ScoutTrashParityResponse = {
      state: 'unknown',
      checkedAt,
      reason: `radarr_parity_error:${(err as Error).message}`,
      baselineCount: getStoredRadarrBaseline(db).length,
      currentCount: 0,
      diff: { added: [], removed: [], changed: [] },
    };
    applySettings(db, {
      scoutTrashParityState: out.state,
      scoutTrashParityCheckedAt: checkedAt,
      scoutTrashParityDiffJson: JSON.stringify(out.diff),
      scoutTrashParityReason: out.reason ?? '',
    });
    return out;
  }
}

function getTrashParity(db: CuratDb): ScoutTrashParityResponse {
  const checkedAt = db.getSetting('scoutTrashParityCheckedAt') ?? '';
  const stateRaw = db.getSetting('scoutTrashParityState') ?? 'unknown';
  const reason = db.getSetting('scoutTrashParityReason') ?? '';
  const diff = parseJsonSetting<ScoutTrashParityDiff>(db, 'scoutTrashParityDiffJson', {
    added: [],
    removed: [],
    changed: [],
  });
  const baseline = getStoredRadarrBaseline(db);
  return {
    state: stateRaw === 'in_sync' || stateRaw === 'drifted' ? stateRaw : 'unknown',
    checkedAt: checkedAt || new Date(0).toISOString(),
    reason: reason || undefined,
    baselineCount: baseline.length,
    currentCount: baseline.length + diff.added.length - diff.removed.length,
    diff,
  };
}

function applySettings(db: CuratDb, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    db.setSetting(key, value);
  }
}

function upsertRuleSeedCategory(db: CuratDb, category: string, seeds: ScoutRuleSeed[]): number[] {
  const existing = db.getRules(category);
  const existingByName = new Map(existing.map((r) => [r.name, r]));
  const saved: number[] = [];
  for (const seed of seeds) {
    const prev = existingByName.get(seed.name);
    const id = db.upsertRule({
      id: prev?.id,
      category,
      name: seed.name,
      enabled: prev ? prev.enabled !== 0 : (seed.enabled ?? true),
      priority: prev?.priority ?? seed.priority,
      config: prev ? (safeParseJson(prev.config) as object) : seed.config,
    });
    saved.push(id);
  }
  return saved;
}

function ensureScoutLlmRulesetBaseline(db: CuratDb): number[] {
  return upsertRuleSeedCategory(db, 'scout_llm_ruleset', SCOUT_LLM_RULESET_BASELINE);
}

function ensureScoutCustomCfBaseline(db: CuratDb): number[] {
  return upsertRuleSeedCategory(db, 'scout_custom_cf', SCOUT_CUSTOM_CF_BASELINE);
}

function seedScoutExampleRulesOnce(db: CuratDb): void {
  if (db.getSetting('scout_examples_v1_seeded') === '1') return;

  if (db.getRules('scout_llm_ruleset').length === 0) {
    ensureScoutLlmRulesetBaseline(db);
  }
  if (db.getRules('scout_custom_cf').length === 0) {
    ensureScoutCustomCfBaseline(db);
  }
  db.setSetting('scout_examples_v1_seeded', '1');
}

async function fetchTrashGuidesRevision(): Promise<{
  source: string;
  revision: string | null;
  fetchedAt: string;
  warning?: string;
}> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(
      'https://api.github.com/repos/TRaSH-Guides/Guides/commits?path=docs/json/radarr/cf-groups&per_page=1',
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
    const body = (await res.json()) as Array<{ sha?: string }>;
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

async function fetchTrashGuidesSnapshot(): Promise<{ snapshot: TrashUpstreamSnapshot | null; warning?: string }> {
  const path = 'docs/json/radarr/cf-groups';
  const maxFiles = 10;
  const maxBytes = 180_000;
  try {
    const listRes = await fetch(`https://api.github.com/repos/TRaSH-Guides/Guides/contents/${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'curatarr-scout-sync' },
    });
    if (!listRes.ok) {
      return { snapshot: null, warning: `upstream_list_failed_${listRes.status}` };
    }
    const list = (await listRes.json()) as Array<{
      type?: string;
      name?: string;
      size?: number;
      download_url?: string | null;
    }>;
    const jsonFiles = list
      .filter(
        (f) =>
          f.type === 'file' &&
          typeof f.name === 'string' &&
          f.name.endsWith('.json') &&
          typeof f.download_url === 'string',
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    const selected = jsonFiles.slice(0, maxFiles);
    const files: TrashUpstreamFileSnapshot[] = [];
    for (const file of selected) {
      const name = file.name ?? 'unknown.json';
      const size = Number(file.size ?? 0);
      const downloadUrl = file.download_url ?? '';
      if (size > maxBytes) {
        files.push({ name, size, downloadUrl, warning: `skipped_oversize_${size}` });
        continue;
      }
      try {
        const contentRes = await fetch(downloadUrl, { headers: { 'User-Agent': 'curatarr-scout-sync' } });
        if (!contentRes.ok) {
          files.push({ name, size, downloadUrl, warning: `content_fetch_failed_${contentRes.status}` });
          continue;
        }
        const parsedJson = await contentRes.json().catch(() => null);
        if (parsedJson == null) {
          files.push({ name, size, downloadUrl, warning: 'invalid_json' });
          continue;
        }
        files.push({ name, size, downloadUrl, parsedJson });
      } catch (err) {
        files.push({ name, size, downloadUrl, warning: `content_fetch_failed_${(err as Error).message}` });
      }
    }
    return {
      snapshot: {
        path,
        fileCount: jsonFiles.length,
        truncated: jsonFiles.length > maxFiles,
        files,
      },
      warning: jsonFiles.length > maxFiles ? `upstream_files_truncated_${maxFiles}` : undefined,
    };
  } catch (err) {
    return { snapshot: null, warning: `upstream_fetch_failed_${(err as Error).message}` };
  }
}

function parseJsonSetting<T>(db: CuratDb, key: string, fallback: T): T {
  const raw = db.getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getTrashSyncDetails(db: CuratDb): TrashSyncDetailsResponse {
  const source = db.getSetting('scoutTrashSyncSource') ?? '';
  const revisionRaw = db.getSetting('scoutTrashSyncRevision') ?? '';
  const modelVersion = db.getSetting('scoutTrashSyncModelVersion') ?? TRASH_SYNC_MODEL_VERSION;
  const mappingRevision = db.getSetting('scoutTrashMappingRevision') ?? TRASH_SYNC_MODEL_VERSION;
  const syncedAtRaw = db.getSetting('scoutTrashSyncedAt') ?? '';
  const rulesSyncedRaw = Number.parseInt(db.getSetting('scoutTrashSyncedRules') ?? '0', 10);
  const warning = db.getSetting('scoutTrashSyncWarning') ?? '';
  return {
    meta: {
      source: source || 'TRaSH-Guides',
      revision: revisionRaw || null,
      modelVersion,
      mappingRevision,
      syncedAt: syncedAtRaw || null,
      rulesSynced: Number.isFinite(rulesSyncedRaw) ? rulesSyncedRaw : 0,
      warning: warning || undefined,
    },
    upstream: parseJsonSetting<TrashUpstreamSnapshot | null>(db, 'scoutTrashUpstreamSnapshotJson', null),
  };
}

function buildScoutRefinementDraft(
  db: CuratDb,
  objective: string,
): {
  objective: string;
  prompt: string;
  proposedSettings: Record<string, string>;
  suggestedRuleToggles: Array<{ id: number; name: string; enabled: boolean }>;
} {
  const normalized = objective.toLowerCase();
  const refinedObjective = objective || 'Balance quality, compatibility, and predictable automatic decisions.';
  const proposedSettings: Record<string, string> = {};
  const rules = db.getRules('scout_llm_ruleset');
  const toggles: Array<{ id: number; name: string; enabled: boolean }> = [];

  if (/\b(storage|size|efficient|space|compact)\b/.test(normalized)) {
    proposedSettings.scoutPipelineBasicSourceRemux = '24';
  }
  if (/\b(quality|cinema|reference|best|archive)\b/.test(normalized)) {
    proposedSettings.scoutPipelineBasicSourceRemux = '40';
    proposedSettings.scoutPipelineBasicSourceBluray = '26';
    proposedSettings.scoutPipelineBasicRes2160 = '52';
  }
  if (/\b(compat|android|chromecast|transcode|playback)\b/.test(normalized)) {
    proposedSettings.scoutPipelineBasicVideoAv1 = '6';
    proposedSettings.scoutPipelineBasicVideoH264 = '14';
    for (const rule of rules) {
      if (rule.name.toLowerCase().includes('av1')) toggles.push({ id: rule.id, name: rule.name, enabled: true });
    }
  }
  if (/\b(remux|exceptional|landmark|criterion|reference)\b/.test(normalized)) {
    for (const rule of rules) {
      if (rule.name.toLowerCase().includes('remux')) toggles.push({ id: rule.id, name: rule.name, enabled: true });
    }
  }
  if (/\b(original language|dub|foreign|non-english|native audio)\b/.test(normalized)) {
    for (const rule of rules) {
      if (rule.name.toLowerCase().includes('original-language')) {
        toggles.push({ id: rule.id, name: rule.name, enabled: true });
      }
    }
  }
  if (/\b(torrent)\b/.test(normalized) && !/\b(usenet)\b/.test(normalized)) {
    proposedSettings.scoutPipelineBasicTorrentBonus = '8';
    proposedSettings.scoutPipelineBasicUsenetBonus = '0';
  }
  if (/\b(usenet)\b/.test(normalized) && !/\b(torrent)\b/.test(normalized)) {
    proposedSettings.scoutPipelineBasicUsenetBonus = '12';
    proposedSettings.scoutPipelineBasicTorrentBonus = '-2';
  }

  const scoreCfg = scoutScoring.resolveScoutScoreConfig(db);
  const compactRules = rules
    .map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled !== 0,
      priority: r.priority,
      config: safeParseJson(r.config),
    }))
    .sort((a, b) => a.priority - b.priority || a.id - b.id);

  const allowedSettings = [
    'scoutPipelineMinCritic',
    'scoutPipelineMinImdb',
    'scoutPipelineBatchSize',
    'scoutPipelineBitrateTargetMbps',
    'scoutPipelineBitrateTolerancePct',
    'scoutPipelineBitrateMaxScore',
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
    'scoutPipelineBasicLegacyPenalty',
    'scoutPipelineBasicSeedersDivisor',
    'scoutPipelineBasicSeedersBonusCap',
    'scoutPipelineBasicUsenetBonus',
    'scoutPipelineBasicTorrentBonus',
    'scoutPipelineLlmTieDelta',
    'scoutPipelineLlmWeakDropDelta',
  ];

  const prompt = [
    'ROLE',
    'You are "Scout Rule Engineer", optimizing Curatarr Scout quality decisions.',
    'Your output must be deterministic, conservative, and directly usable by a backend patch endpoint.',
    '',
    'TASK',
    `Primary objective: ${refinedObjective}`,
    'Refine only Scout scoring/rules with minimal changes needed to satisfy the objective.',
    '',
    'BASELINE CONTEXT',
    'Scout Quality Pipeline order is fixed: qualifiers -> basic scoring -> TRaSH baseline (read-only) -> custom overrides/blockers -> final LLM rules -> manual/auto decision.',
    'Baseline philosophy: deterministic scoring remains primary; LLM layer only drops weak candidates and resolves near ties.',
    'Safety expectations: no quality downgrade behavior, no unsafe broad drops, no key invention, no schema changes.',
    '',
    'CURRENT SCOUT SETTINGS',
    JSON.stringify(scoreCfg, null, 2),
    '',
    'CURRENT LLM RULESET',
    JSON.stringify(compactRules, null, 2),
    '',
    'ALLOWED SETTING KEYS (string values only)',
    JSON.stringify(allowedSettings, null, 2),
    '',
    'OUTPUT CONTRACT (JSON ONLY, no markdown)',
    '{',
    '  "settingsPatch": { "<allowedKey>": "<stringValue>" },',
    '  "rulePatches": [',
    '    { "id": <number>, "name": "<string>", "enabled": <boolean>, "priority": <number>, "config": { "sentence": "<string>" } }',
    '  ],',
    '  "safetyChecks": [ "<short check>" ],',
    '  "rationale": "<short explanation>"',
    '}',
    '',
    'GUARDRAILS',
    '- Use only keys in ALLOWED SETTING KEYS.',
    '- Keep scoutPipelineBatchSize between 1 and 10.',
    '- Keep scoutPipelineBasicLegacyPenalty > 0.',
    '- Do not remove all enabled LLM rules unless objective explicitly requests disabling LLM behavior.',
    '- Prefer small targeted edits over large rewrites.',
  ].join('\n');

  return {
    objective,
    prompt,
    proposedSettings,
    suggestedRuleToggles: toggles,
  };
}

function resolveProwlarrConfig(db: CuratDb): { url: string; apiKey: string } | null {
  const url = db.getSetting('prowlarrUrl') ?? '';
  const apiKey = db.getSetting('prowlarrApiKey') ?? '';
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

function configuredBatchCap(db: CuratDb): number {
  const raw = Number.parseInt(db.getSetting('scoutPipelineBatchSize') ?? '10', 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(10, raw));
}

function protocolCounts(rows: ProwlarrSearchResult[]): { torrent: number; usenet: number; unknown: number } {
  const out = { torrent: 0, usenet: 0, unknown: 0 };
  for (const row of rows) {
    if (row.protocol === 'torrent') out.torrent++;
    else if (row.protocol === 'usenet') out.usenet++;
    else out.unknown++;
  }
  return out;
}

function dedupeScoutReleases(rows: ProwlarrSearchResult[]): ProwlarrSearchResult[] {
  const byKey = new Map<string, ProwlarrSearchResult>();
  for (const row of rows) {
    const titleKey = row.title.trim().toLowerCase().replace(/\s+/g, ' ');
    const key = row.guid || row.downloadUrl || `${titleKey}|${row.size ?? 0}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

async function fetchScoutReleases(
  client: ProwlarrClient,
  query: string,
  ctx?: { imdbId?: string | null; title?: string | null; year?: number | null },
): Promise<ProwlarrSearchResult[]> {
  try {
    const indexers = await client.listIndexers();
    const usenetIndexers = indexers.filter((x) => x.protocol === 'usenet');
    const torrentIds = indexers.filter((x) => x.protocol === 'torrent').map((x) => x.id);
    if (usenetIndexers.length === 0 && torrentIds.length === 0) {
      return client.searchMovie(query);
    }
    const combined: ProwlarrSearchResult[] = [];
    let fetched = false;
    if (usenetIndexers.length > 0) {
      try {
        const queryForms = Array.from(
          new Set(
            [query, [ctx?.title ?? '', ctx?.year ?? ''].filter(Boolean).join(' '), ctx?.title ?? '']
              .map((x) => x.trim())
              .filter((x) => x.length > 0),
          ),
        );
        for (const idx of usenetIndexers) {
          const imdbId = (ctx?.imdbId ?? '').trim().replace(/^tt/i, '');
          let usenetRows: ProwlarrSearchResult[] = [];
          for (const q of queryForms) {
            usenetRows = await client.searchUsenetIndexerFeed(idx.id, idx.name, {
              query: q,
              imdbId: imdbId || null,
              categories: '2000',
            });
            if (usenetRows.length > 0) break;
          }
          combined.push(...usenetRows);
        }
        fetched = true;
      } catch {
        // fall through
      }
    }
    if (torrentIds.length > 0) {
      try {
        combined.push(...(await client.searchMovie(query, { indexerIds: torrentIds })));
        fetched = true;
      } catch {
        // fall through
      }
    }
    if (!fetched) return client.searchMovie(query);
    return dedupeScoutReleases(combined);
  } catch {
    return client.searchMovie(query);
  }
}

function releaseRecencyEpoch(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function pickBestRecommendation(releases: ScoredRelease[], cfg: ScoutScoreConfig): ScoredRelease | null {
  if (releases.length === 0) return null;
  const sorted = [...releases].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const tieDelta = Math.max(0, cfg.llmTieDelta);
  const shortlist = sorted.filter((r) => topScore - r.score <= tieDelta);
  shortlist.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const seedA = a.seeders ?? 0;
    const seedB = b.seeders ?? 0;
    if (seedB !== seedA) return seedB - seedA;
    const recencyA = releaseRecencyEpoch(a.publishDate);
    const recencyB = releaseRecencyEpoch(b.publishDate);
    if (recencyB !== recencyA) return recencyB - recencyA;
    return a.title.localeCompare(b.title);
  });
  return shortlist[0] ?? null;
}

function recommendationSummary(top: ScoredRelease | null, cfg: ScoutScoreConfig): string {
  if (!top) return 'No efficient path could be computed from the available releases.';
  const reasons = top.reasons.length > 0 ? top.reasons.join(', ') : 'balanced quality and availability';
  return `Recommended release (top score ±${cfg.llmTieDelta}): "${top.title}" (score ${top.score}) driven by ${reasons}.`;
}

async function searchOneMovie(
  db: CuratDb,
  client: ProwlarrClient,
  movieId: number,
  queryOverride?: string,
  forceRefresh = false,
): Promise<SearchSuccess> {
  const movie = db.getMovieById(movieId);
  if (!movie) throw new Error('movie_not_found');
  const title = movie.jellyfin_title ?? movie.parsed_title ?? movie.folder_name;
  const year = movie.jellyfin_year ?? movie.parsed_year;
  const query = toText(queryOverride).trim() || [title, year].filter(Boolean).join(' ');
  const revision = scoutCache.buildScoutConfigRevision(db);
  const cacheKey = scoutCache.buildScoutCacheKey(movieId, query, revision);
  const now = Date.now();
  const cached = scoutSearchCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return scoutCache.withScoutCacheMeta(cached.payload, true, revision, cached.expiresAt);
  }
  if (cached) scoutSearchCache.delete(cacheKey);

  const scoreCfg = scoutScoring.resolveScoutScoreConfig(db);
  const customCfRules = scoutScoring.loadScoutCustomCfRules(db);
  const blockerRules = scoutScoring.loadScoutBlockerRules(db);
  const llmRules = scoutScoring.loadScoutLlmRules(db);
  const blockersEnabled = (db.getSetting('scoutPipelineBlockersEnabled') ?? 'false').toLowerCase() === 'true';
  const runtimeSec = db.getFilesForMovie(movieId).find((f) => (f.duration ?? 0) > 0)?.duration ?? null;

  const releases = await fetchScoutReleases(client, query, {
    imdbId: movie.imdb_id ?? null,
    title,
    year,
  });
  const scoredBasic = releases.map((r) => scoutScoring.addBasicFormatScore(r, scoreCfg, runtimeSec));
  const scoredWithCustom = scoredBasic.map((r) => {
    const custom = scoutScoring.applyCustomCfRules(r, customCfRules);
    if (custom.delta === 0) return r;
    return {
      ...r,
      score: r.score + custom.delta,
      reasons: [...r.reasons, ...custom.reasons],
    };
  });

  const blockerResult = blockersEnabled
    ? scoutScoring.applyBlockerRules(scoredWithCustom, blockerRules)
    : { finals: scoredWithCustom, dropped: [] as DroppedRelease[] };
  const percentileResult = scoutScoring.applyTopPercentileGate(blockerResult.finals, 0.1);
  const llmResult = scoutScoring.applyLlmRuleset(percentileResult.finals, llmRules, scoreCfg);
  const llmSingleResult = scoutScoring.applyLlmSingleCandidateGate(llmResult.finals, llmRules);
  const scored = llmSingleResult.finals;
  const dropped = [
    ...blockerResult.dropped,
    ...percentileResult.dropped,
    ...llmResult.dropped,
    ...llmSingleResult.dropped,
  ];
  const allRows = [...scored, ...dropped];
  const best = pickBestRecommendation(scored, scoreCfg);
  const summary = `${recommendationSummary(best, scoreCfg)}${dropped.length > 0 ? ` ${dropped.length} release(s) dropped by gating/rules.` : ''}`;
  const result: SearchSuccess = {
    movieId,
    query,
    total: scored.length,
    releases: scored,
    droppedReleases: dropped,
    protocolCounts: protocolCounts(allRows),
    recommendation: {
      mode: 'tabulated',
      summary,
      best,
    },
  };
  const expiresAt = Date.now() + scoutCache.SCOUT_CACHE_TTL_MS;
  scoutCache.pruneScoutCache(scoutSearchCache);
  scoutSearchCache.set(cacheKey, { expiresAt, payload: result });
  scoutCache.pruneScoutCache(scoutSearchCache);
  return scoutCache.withScoutCacheMeta(result, false, revision, expiresAt);
}

function toPriorityScore(mc: number | null, imdb: number | null): number {
  return Math.round((mc ?? 0) * 0.4 + (imdb ?? 0) * 6);
}

function configuredCooldownMin(db: CuratDb): number {
  const raw = Number.parseInt(db.getSetting('scoutPipelineAutoCooldownMin') ?? '240', 10);
  if (!Number.isFinite(raw)) return 240;
  return Math.max(5, Math.min(24 * 60, raw));
}

function pickAutoMovieIds(db: CuratDb, cap: number): { ids: number[]; skippedByCooldown: number } {
  const minCritic = Number.parseFloat(db.getSetting('scoutPipelineMinCritic') ?? '65');
  const minCommunity = Number.parseFloat(db.getSetting('scoutPipelineMinImdb') ?? '7.0');
  const pool = db.getUpgradeCandidates({
    maxResolution: '2160p',
    minCriticRating: Number.isFinite(minCritic) ? minCritic : 65,
    minCommunityRating: Number.isFinite(minCommunity) ? minCommunity : 7.0,
    limit: 250,
  });

  const now = Date.now();
  const cooldownMs = configuredCooldownMin(db) * 60_000;
  const byPriority = pool
    .map((c) => ({ id: c.id, priority: toPriorityScore(c.critic_rating, c.community_rating) }))
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

export async function runScoutAutoBatch(db: CuratDb, trigger: 'manual' | 'scheduled'): Promise<ScoutAutoRunSummary> {
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
  seedScoutExampleRulesOnce(db);

  // POST /api/scout/sync-trash-scores
  app.post('/sync-trash-scores', async (c) => {
    const meta = await fetchTrashGuidesRevision();
    const upstream = await fetchTrashGuidesSnapshot();
    const mappingRevision = TRASH_SYNC_MODEL_VERSION;
    const warningCombined = [meta.warning, upstream.warning].filter(Boolean).join('; ');
    const radarrCfg = resolveRadarrConfig(db);
    let radarrSnapshot: RadarrCfScoreItem[] = [];
    if (radarrCfg) {
      try {
        radarrSnapshot = await fetchRadarrCustomFormatScores(radarrCfg.url, radarrCfg.apiKey);
      } catch {
        radarrSnapshot = [];
      }
    }
    applySettings(db, {
      scoutTrashSyncSource: meta.source,
      scoutTrashSyncRevision: meta.revision ?? '',
      scoutTrashSyncModelVersion: TRASH_SYNC_MODEL_VERSION,
      scoutTrashMappingRevision: mappingRevision,
      scoutTrashSyncedAt: meta.fetchedAt,
      scoutTrashSyncedRules: '0',
      scoutTrashUpstreamSnapshotJson: JSON.stringify(upstream.snapshot),
      scoutTrashSyncWarning: warningCombined,
      scoutTrashRadarrSnapshotJson: JSON.stringify(radarrSnapshot),
    });
    await refreshTrashParity(db);
    const details = getTrashSyncDetails(db);
    return c.json({
      syncedRules: 0,
      syncModelVersion: TRASH_SYNC_MODEL_VERSION,
      mappingRevision,
      meta: { ...meta, warning: warningCombined || meta.warning },
      details,
    });
  });

  // GET /api/scout/trash-sync-details
  app.get('/trash-sync-details', (c) => {
    return c.json(getTrashSyncDetails(db));
  });

  // GET /api/scout/trash-parity?refresh=1
  app.get('/trash-parity', async (c) => {
    const refresh = c.req.query('refresh') === '1' || c.req.query('refresh') === 'true';
    if (refresh) {
      const parity = await refreshTrashParity(db);
      return c.json(parity);
    }
    return c.json(getTrashParity(db));
  });

  // POST /api/scout/custom-cf/preview { title: string }
  app.post('/custom-cf/preview', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
    const title = toText(body.title).trim();
    if (!title) return c.json({ error: 'title_required' }, 400);
    const rules = scoutScoring.loadScoutCustomCfRules(db);
    const match = scoutScoring.applyCustomCfRules(
      {
        title,
        indexer: null,
        protocol: 'unknown',
        size: null,
        publishDate: null,
        guid: null,
        downloadUrl: null,
        seeders: null,
        peers: null,
      },
      rules,
    );
    return c.json({
      title,
      totalRules: rules.length,
      delta: match.delta,
      reasons: match.reasons,
      matchedRuleIds: match.matchedRuleIds,
    });
  });

  // POST /api/scout/rules/refine-draft  { objective: string }
  app.post('/rules/refine-draft', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { objective?: unknown };
    const objective = toText(body.objective).trim();
    const draft = buildScoutRefinementDraft(db, objective);
    return c.json(draft);
  });

  // GET /api/scout/rules
  app.get('/rules', (c) => {
    const grouped = listScoutRules(db);
    const category = toText(c.req.query('category')).trim();
    if (!category) return c.json({ rules: grouped });
    return c.json({ rules: { [category]: grouped[category] ?? [] } });
  });

  // PUT /api/scout/rules/replace-category
  app.put('/rules/replace-category', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { category?: unknown; rules?: unknown };
    const res = replaceScoutRuleCategory(db, body.category, body.rules);
    if (res.error) return c.json({ error: res.error }, 400);
    return c.json({ saved: res.saved ?? [] });
  });

  // POST /api/scout/search-one  { movieId: number, query?: string, forceRefresh?: boolean }
  app.post('/search-one', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      movieId?: unknown;
      query?: unknown;
      forceRefresh?: unknown;
    };
    const movieId = Number(body.movieId);
    const forceRefresh = body.forceRefresh === true;
    if (!Number.isFinite(movieId) || movieId <= 0) {
      return c.json({ error: 'invalid_movie_id' }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) {
      return c.json({ error: 'prowlarr_not_configured' }, 422);
    }

    try {
      const client = new ProwlarrClient(cfg.url, cfg.apiKey);
      const result = await searchOneMovie(db, client, movieId, toText(body.query), forceRefresh);
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
    const body = (await c.req.json().catch(() => ({}))) as { movieIds?: unknown; batchSize?: unknown };
    const movieIdsRaw = Array.isArray(body.movieIds) ? body.movieIds : [];
    const movieIds = Array.from(new Set(movieIdsRaw.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)));
    if (movieIds.length === 0) return c.json({ error: 'movie_ids_required' }, 400);
    if (movieIds.length > 10) return c.json({ error: 'batch_limit_exceeded', max: 10 }, 400);

    const cap = configuredBatchCap(db);
    if (movieIds.length > cap) {
      return c.json({ error: 'batch_limit_exceeded', max: cap }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) return c.json({ error: 'prowlarr_not_configured' }, 422);

    const client = new ProwlarrClient(cfg.url, cfg.apiKey);
    const results: Array<{
      movieId: number;
      query?: string;
      total?: number;
      releases?: ScoredRelease[];
      droppedReleases?: DroppedRelease[];
      error?: string;
    }> = [];
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
