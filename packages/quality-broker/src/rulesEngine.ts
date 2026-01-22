import { Engine } from 'json-rules-engine';
import type { RuleProperties, RuleResult } from 'json-rules-engine';

import { BrokerConfig, DecisionResult, RadarrMovie, RuleDefinition } from './types.js';
import {
  buildPopularitySignal,
  computePopularityTier,
  computeVisualScore,
  getCriticScore,
  getPopularity,
  isLowQ,
  is4kQuality,
  matchVisualGenres,
  normalizeName
} from './signals.js';

export interface RuleFacts {
  criticScore?: number;
  criticScorePresent: boolean;
  criticScoreHigh: boolean;
  criticScoreMidBand: boolean;
  criticScoreBlockOrBelow: boolean;
  criticScoreAmbiguous: boolean;
  popularityValue?: number;
  popularityTier?: 'low' | 'mid' | 'high';
  popularityStrong: boolean;
  popularityMid: boolean;
  popularityLow: boolean;
  genres: string[];
  visualScore: number;
  visualMatches: string[];
  visualMatchCount: number;
  visualRich: boolean;
  visualScoreLow: boolean;
  lowq: boolean;
  currentIs4k: boolean;
  currentQuality?: string;
  decisionScore: number;
  decisionScoreTier: 'low' | 'mid' | 'high';
}

export interface RulesEngineDecision {
  decision: DecisionResult;
  facts: RuleFacts;
}

function addRuleNames(rules: RuleDefinition[]): RuleDefinition[] {
  return rules.map((rule) => ({
    ...rule,
    event: {
      ...rule.event,
      params: {
        ...(rule.event?.params || {}),
        ruleName: rule.event?.params?.ruleName || rule.name
      }
    }
  }));
}

function buildFacts(movie: RadarrMovie, config: BrokerConfig): RuleFacts {
  const thresholds = config.thresholds || {};
  const criticHigh = thresholds.criticHigh as number;
  const criticMid = thresholds.criticMid as number;
  const criticBlock = thresholds.criticBlock as number;
  const popularityHigh = thresholds.popularityHigh as number;
  const popularityLow = thresholds.popularityLow as number;

  const criticScore = getCriticScore(movie);
  const criticScorePresent = typeof criticScore === 'number';
  const criticScoreHigh = criticScorePresent && criticScore >= criticHigh;
  const criticScoreMidBand =
    criticScorePresent && criticScore >= criticMid && criticScore < criticHigh;
  const criticScoreBlockOrBelow = criticScorePresent && criticScore <= criticBlock;
  const ambiguity = config.rulesEngine?.ambiguity || {};
  const criticMidDelta = typeof ambiguity.criticMidDelta === 'number' ? ambiguity.criticMidDelta : 1;
  const criticScoreAmbiguous =
    criticScorePresent && criticScore >= criticMid - criticMidDelta && criticScore <= criticMid + criticMidDelta;

  const popularitySignal = buildPopularitySignal(movie);
  const popularityValue =
    typeof popularitySignal.computedPopularityIndex === 'number'
      ? popularitySignal.computedPopularityIndex
      : getPopularity(movie);
  const popularityTier = computePopularityTier(popularityValue, thresholds);
  const popularityStrong = typeof popularityValue === 'number' && popularityValue >= popularityHigh;
  const popularityLowScore = typeof popularityValue === 'number' && popularityValue <= popularityLow;
  const popularityMid =
    typeof popularityValue === 'number' && popularityValue > popularityLow && popularityValue < popularityHigh;

  const genres = Array.isArray(movie.genres) ? movie.genres : [];
  const visualWeights = config.rulesEngine?.visualWeights || {};
  const visualMatches = matchVisualGenres(genres, visualWeights);
  const visualScoreConfig = config.rulesEngine?.visualScoreConfig || {};
  const maxVisualScore = visualScoreConfig.maxScore as number;
  const visualRichMin = visualScoreConfig.richMin as number;
  const visualScoreLowMax =
    typeof visualScoreConfig.lowMax === 'number'
      ? visualScoreConfig.lowMax
      : typeof ambiguity.visualScoreMax === 'number'
        ? ambiguity.visualScoreMax
        : 1;

  const visualScore = computeVisualScore(visualMatches, visualWeights, maxVisualScore);
  const visualMatchCount = visualMatches.length;
  const visualRich = visualScore >= visualRichMin;
  const visualScoreLow = visualScore <= visualScoreLowMax;

  const currentQuality = movie.movieFile?.quality?.quality?.name;
  const lowq = isLowQ(currentQuality);
  const currentIs4k = is4kQuality(currentQuality);

  const weights = config.rulesEngine?.weights || {};
  const scoreThresholds = config.rulesEngine?.scoreThresholds || {};
  const criticHighBoost = weights.criticHighBoost ?? 0;
  const criticMidBandWeight = weights.criticMidBand ?? 0;
  const popularityStrongWeight = weights.popularityStrong ?? 0;
  const popularityMidWeight = weights.popularityMid ?? 0;
  const visualRichWeight = weights.visualRich ?? 0;
  const visualScorePerPoint = weights.visualScorePerPoint ?? 0;
  const efficient4k = scoreThresholds.efficient4k ?? 0;
  const high4k = scoreThresholds.high4k ?? Math.max(efficient4k, 0);

  let decisionScore = 0;
  if (criticScoreHigh) decisionScore += criticHighBoost;
  if (criticScoreMidBand) decisionScore += criticMidBandWeight;
  if (popularityStrong) decisionScore += popularityStrongWeight;
  if (popularityMid) decisionScore += popularityMidWeight;
  if (visualRich) decisionScore += visualRichWeight;
  decisionScore += visualScore * visualScorePerPoint;

  let decisionScoreTier: 'low' | 'mid' | 'high' = 'low';
  if (decisionScore >= high4k) {
    decisionScoreTier = 'high';
  } else if (decisionScore >= efficient4k) {
    decisionScoreTier = 'mid';
  }

  return {
    criticScore,
    criticScorePresent,
    criticScoreHigh,
    criticScoreMidBand,
    criticScoreBlockOrBelow,
    criticScoreAmbiguous,
    popularityValue: typeof popularityValue === 'number' ? popularityValue : undefined,
    popularityTier,
    popularityStrong,
    popularityMid,
    popularityLow: popularityLowScore,
    genres,
    visualScore,
    visualMatches,
    visualMatchCount,
    visualRich,
    visualScoreLow,
    lowq,
    currentIs4k,
    currentQuality,
    decisionScore: Math.round(decisionScore * 10) / 10,
    decisionScoreTier
  };
}

function clampSentences(text: string, maxSentences: number): string {
  const cleaned = text.trim();
  if (!cleaned || maxSentences <= 0) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
  return sentences.length > maxSentences ? sentences.slice(0, maxSentences).join(' ').trim() : cleaned;
}

function buildReasoning(
  profile: string,
  rules: string[],
  facts: RuleFacts,
  config: BrokerConfig
): string {
  const thresholds = config.thresholds || {};
  const popularityLow = thresholds.popularityLow as number;
  const parts: string[] = [];

  if (rules.includes('lowq')) {
    if (facts.currentQuality) {
      parts.push(`current quality is ${facts.currentQuality}`);
    } else {
      parts.push('current file is low quality');
    }
  }
  if (rules.includes('crit') && typeof facts.criticScore === 'number') {
    parts.push(`critic score ${facts.criticScore}`);
  }
  if (rules.includes('pop') && typeof facts.popularityValue === 'number') {
    parts.push(`popularity index ${facts.popularityValue}`);
  }
  if (rules.includes('vis') && facts.visualMatches.length) {
    parts.push(`visual score ${facts.visualScore} (genres ${facts.visualMatches.join(', ')})`);
  }

  if (rules.includes('weak')) {
    const missing: string[] = [];
    if (!facts.criticScorePresent) missing.push('missing critic score');
    if (facts.popularityValue == null) missing.push('missing popularity');
    if (typeof facts.popularityValue === 'number' && facts.popularityValue <= popularityLow) {
      missing.push('low popularity');
    }
    if (facts.visualScore === 0) missing.push('no visual genres');
    parts.push(missing.length ? `limited signal (${missing.join(', ')})` : 'limited signal');
  }

  if (rules.includes('mix')) parts.push('mixed signals');

  if (!parts.length) parts.push('limited signal');

  const maxSentences = config.policies?.reasoning?.maxSentences ?? 2;
  return clampSentences(`Chose ${profile} because ${parts.join('; ')}.`, maxSentences);
}

function normalizeReasons(
  rules: string[] | undefined,
  config: BrokerConfig,
  facts: RuleFacts
): string[] {
  const allowedReasons = new Set(Object.keys(config.reasonTags || {}));
  const normalized = (rules || []).filter((r) => allowedReasons.has(r));
  if (!normalized.length && allowedReasons.size) {
    const add = (reason: string) => {
      if (allowedReasons.has(reason) && !normalized.includes(reason)) normalized.push(reason);
    };
    if (facts.criticScoreHigh || facts.criticScoreMidBand) add('crit');
    if (facts.popularityStrong) add('pop');
    if (facts.visualRich) add('vis');
    if (facts.lowq) add('lowq');
    if (
      (facts.popularityStrong && !facts.visualRich) ||
      (!facts.popularityStrong && facts.visualRich)
    ) {
      add('mix');
    }
    if (!normalized.length) add('weak');
  }
  if (facts.lowq && allowedReasons.has('lowq') && !normalized.includes('lowq')) {
    normalized.push('lowq');
  }
  if (!normalized.length && allowedReasons.has('weak')) {
    normalized.push('weak');
  }
  return normalized;
}

function addOperators(engine: Engine) {
  engine.addOperator('betweenInclusive', (factValue: unknown, range: unknown) => {
    if (!Array.isArray(range) || range.length !== 2) return false;
    if (typeof factValue !== 'number') return false;
    const [min, max] = range as [number, number];
    return factValue >= min && factValue <= max;
  });

  engine.addOperator('includesAny', (factValue: unknown, values: unknown) => {
    if (!Array.isArray(factValue) || !Array.isArray(values)) return false;
    const normalizedFact = factValue.map((v) => normalizeName(String(v)));
    return values.some((v) => normalizedFact.includes(normalizeName(String(v))));
  });
}

export function createRulesEngine(config: BrokerConfig) {
  const rules = addRuleNames(config.rulesEngine?.rules || []);
  const engine = new Engine(rules as unknown as RuleProperties[], { allowUndefinedFacts: true });
  addOperators(engine);
  return {
    async decide(movie: RadarrMovie): Promise<RulesEngineDecision> {
      const facts = buildFacts(movie, config);
      const results = await engine.run(facts as unknown as Record<string, unknown>);
      const matchedResults = Array.isArray((results as unknown as { results?: unknown }).results)
        ? ((results as unknown as { results: RuleResult[] }).results as RuleResult[])
        : [];

      const matches = matchedResults
        .map((result) => {
          const record = result as unknown as Record<string, unknown>;
          const event = (record.event || (record.rule as Record<string, unknown> | undefined)?.event) as
            | RuleDefinition['event']
            | undefined;
          const name =
            (record.name as string | undefined) ||
            ((record.rule as Record<string, unknown> | undefined)?.name as string | undefined) ||
            (event?.params?.ruleName as string | undefined);
          const priority =
            (typeof record.priority === 'number' ? record.priority : undefined) ??
            (typeof (record.rule as Record<string, unknown> | undefined)?.priority === 'number'
              ? ((record.rule as Record<string, unknown>).priority as number)
              : 0) ??
            0;
          return { event, name, priority };
        })
        .filter((match) => match.event?.type === 'decision' && match.event.params?.profile);

      const winner = matches.sort((a, b) => b.priority - a.priority)[0];
      const profile = winner?.event?.params?.profile || config.decisionProfiles?.[0] || 'HD';
      const rawReasons = winner?.event?.params?.reasons || [];
      const reasons = normalizeReasons(rawReasons, config, facts);
      const reasoning = buildReasoning(profile, reasons, facts, config);
      const requireTier = config.rulesEngine?.ambiguity?.requirePopularityTier;
      const matchesPopularityTier =
        requireTier === undefined ? facts.popularityMid : facts.popularityTier === requireTier;
      const ambiguous =
        facts.criticScoreAmbiguous && matchesPopularityTier && facts.visualScoreLow;
      const ruleName = winner?.name || winner?.event?.params?.ruleName || `score_${facts.decisionScoreTier}`;

      return {
        facts,
        decision: {
          profile,
          rules: reasons,
          reasoning,
          ...(ruleName ? { ruleName } : {}),
          ...(ambiguous ? { ambiguous } : {})
        }
      };
    }
  };
}
