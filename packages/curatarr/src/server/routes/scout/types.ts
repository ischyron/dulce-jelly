import type { ProwlarrSearchResult } from '../../../integrations/prowlarr/client.js';

export interface ScoredRelease extends ProwlarrSearchResult {
  score: number;
  reasons: string[];
}

export interface DroppedRelease extends ProwlarrSearchResult {
  score: number;
  reasons: string[];
  droppedReason: string;
}

export interface ScoutScoreConfig {
  bitrateTargetMbps: number;
  bitrateTolerancePct: number;
  bitrateMaxScore: number;
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
  seedersDivisor: number;
  seedersBonusCap: number;
  usenetBonus: number;
  torrentBonus: number;
  llmTieDelta: number;
  llmWeakDropDelta: number;
}

export interface ScoutRecommendation {
  mode: 'tabulated';
  summary: string;
  best: ScoredRelease | null;
}

export interface SearchSuccess {
  movieId: number;
  query: string;
  total: number;
  releases: ScoredRelease[];
  droppedReleases: DroppedRelease[];
  protocolCounts?: {
    torrent: number;
    usenet: number;
    unknown: number;
  };
  cache?: {
    hit: boolean;
    ttlSecRemaining: number;
    revision: string;
  };
  recommendation: ScoutRecommendation;
}

export interface ScoutCustomCfRule {
  id: number;
  name: string;
  pattern: string;
  score: number;
  matchType: 'regex' | 'string';
  flags: string;
  appliesTo: 'title' | 'full';
}

export interface ScoutLlmRule {
  id: number;
  priority: number;
  sentence: string;
}

export interface ScoutBlockerRule {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: 'regex' | 'string';
  pattern: string;
  flags: string;
  appliesTo: 'title' | 'full';
  reason: string;
}
