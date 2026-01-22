#!/usr/bin/env node
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { loadConfig } from './config.js';
import { LLMAgent } from './llmAgent.js';
import { RunLogger } from './logger.js';
import { RadarrClient } from './radarrClient.js';
import { BrokerConfig, DecisionResult, PopularitySignal, QualityProfile, RadarrMovie, RadarrTag, RunLogEntry } from './types.js';

const baseDir = fileURLToPath(new URL('..', import.meta.url));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCriticScore(movie: RadarrMovie): number | undefined {
  return (
    movie.criticScore ??
    movie.ratings?.rtCritic?.value ??
    movie.ratings?.metacritic?.value ??
    movie.rottenTomatoesCriticScore ??
    undefined
  );
}

function getCriticScoreSource(movie: RadarrMovie): string | undefined {
  if (typeof movie.criticScore === 'number') return 'criticScore';
  if (typeof movie.ratings?.metacritic?.value === 'number') return 'metacritic';
  if (typeof movie.ratings?.rtCritic?.value === 'number') return 'rtCritic';
  if (typeof movie.rottenTomatoesCriticScore === 'number') return 'rtCriticLegacy';
  return undefined;
}

function isLowQ(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /(480p|576p|720p)/i.test(currentQuality);
}

function is4kQuality(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /2160p/i.test(currentQuality);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function matchVisualGenres(genres: string[], visualGenresHigh: string[]): string[] {
  if (!genres.length || !visualGenresHigh.length) return [];
  const set = new Set(visualGenresHigh.map(normalizeName));
  return genres.filter((g) => set.has(normalizeName(g)));
}

function computeVisualScore(matches: string[]): number {
  if (!matches.length) return 0;
  const weights: Record<string, number> = {
    action: 3,
    war: 3,
    animation: 2,
    'sci-fi': 2,
    'sci fi': 2,
    scifi: 2,
    fantasy: 2,
    adventure: 1,
    thriller: 1
  };
  const total = matches.reduce((sum, g) => {
    const key = normalizeName(g);
    return sum + (weights[key] ?? 1);
  }, 0);
  return Math.min(6, total);
}

function getPopularity(movie: RadarrMovie): number | undefined {
  const p = movie.popularity ?? movie.tmdbPopularity;
  return typeof p === 'number' ? p : undefined;
}

function getTmdbVotes(movie: RadarrMovie): number | undefined {
  const v = movie.ratings?.tmdb?.votes ?? movie.ratings?.tmdb?.voteCount ?? movie.tmdbVotes;
  return typeof v === 'number' ? v : undefined;
}

function getTomatoScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rottenTomatoes?.value ?? movie.rottenTomatoesCriticScore ?? undefined;
}

function getRtCriticScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rtCritic?.value ?? undefined;
}

function getTomatoVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rottenTomatoes?.votes ?? undefined;
}

function getRtCriticVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rtCritic?.votes ?? undefined;
}

function getMetacriticScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.metacritic?.value ?? undefined;
}

function getImdbScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.imdb?.value ?? undefined;
}

function getImdbVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.imdb?.votes ?? undefined;
}

function getTmdbScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.tmdb?.value ?? undefined;
}

function computePopularityIndex(votes?: number): number | undefined {
  if (typeof votes !== 'number' || votes <= 0) return undefined;
  const logMin = 3; // 1k votes
  const logMax = 6; // 1M votes
  const normalized = ((Math.log10(votes) - logMin) / (logMax - logMin)) * 100;
  const clamped = Math.max(0, Math.min(100, normalized));
  return Math.round(clamped * 10) / 10;
}

function buildPopularitySignal(movie: RadarrMovie): PopularitySignal {
  const tmdbScore = getTmdbScore(movie);
  const tmdbVotes = getTmdbVotes(movie);
  const imdbScore = getImdbScore(movie);
  const imdbVotes = getImdbVotes(movie);
  const rawPopularity = getPopularity(movie);

  let primarySource: 'tmdb' | 'imdb' | undefined;
  if (typeof tmdbVotes === 'number' && typeof imdbVotes === 'number') {
    primarySource = tmdbVotes >= imdbVotes ? 'tmdb' : 'imdb';
  } else if (typeof tmdbVotes === 'number') {
    primarySource = 'tmdb';
  } else if (typeof imdbVotes === 'number') {
    primarySource = 'imdb';
  }

  const primaryScore = primarySource === 'tmdb' ? tmdbScore : primarySource === 'imdb' ? imdbScore : undefined;
  const primaryVotes = primarySource === 'tmdb' ? tmdbVotes : primarySource === 'imdb' ? imdbVotes : undefined;
  const computedPopularityIndex = computePopularityIndex(primaryVotes);

  return {
    primarySource,
    primaryScore: typeof primaryScore === 'number' ? primaryScore : undefined,
    primaryVotes: typeof primaryVotes === 'number' ? primaryVotes : undefined,
    tmdbScore: typeof tmdbScore === 'number' ? tmdbScore : undefined,
    tmdbVotes: typeof tmdbVotes === 'number' ? tmdbVotes : undefined,
    imdbScore: typeof imdbScore === 'number' ? imdbScore : undefined,
    imdbVotes: typeof imdbVotes === 'number' ? imdbVotes : undefined,
    rawPopularity: typeof rawPopularity === 'number' ? rawPopularity : undefined,
    computedPopularityIndex
  };
}

function computePopularityTier(value: number | undefined, thresholds: BrokerConfig['thresholds']): 'low' | 'mid' | 'high' | undefined {
  if (typeof value !== 'number' || !thresholds) return undefined;
  const low = thresholds.popularityLow as number;
  const high = thresholds.popularityHigh as number;
  if (value <= low) return 'low';
  if (value >= high) return 'high';
  return 'mid';
}

function selectDeterministicDecision(params: {
  movie: RadarrMovie;
  config: BrokerConfig;
}): { decision: DecisionResult; ambiguous: boolean } {
  const { movie, config } = params;
  const thresholds = config.thresholds || {};
  const criticHigh = thresholds.criticHigh as number;
  const criticMid = thresholds.criticMid as number;
  const criticLow = thresholds.criticLow as number;
  const criticBlock = thresholds.criticBlock as number;
  const popularityHigh = thresholds.popularityHigh as number;
  const popularityLow = thresholds.popularityLow as number;

  const criticScore = getCriticScore(movie);
  const popularitySignal = buildPopularitySignal(movie);
  const popularity = typeof popularitySignal.computedPopularityIndex === 'number'
    ? popularitySignal.computedPopularityIndex
    : getPopularity(movie);

  const strongPopularity = typeof popularity === 'number' && popularity >= popularityHigh;
  const popMid = typeof popularity === 'number' && popularity > popularityLow && popularity < popularityHigh;

  const currentQuality: string | undefined = movie.movieFile?.quality?.quality?.name;
  const lowq = isLowQ(currentQuality);
  void is4kQuality(currentQuality);

  const visualMatches = matchVisualGenres(Array.isArray(movie.genres) ? movie.genres : [], config.visualGenresHigh || []);
  const visualScore = computeVisualScore(visualMatches);
  const visualRich = visualScore >= 3;

  const genres = Array.isArray(movie.genres) ? movie.genres : [];
  const hasAction = genres.some((g) => /action/i.test(g));
  const hasWar = genres.some((g) => /war/i.test(g));
  const intenseVisual = hasAction || hasWar;

  const allowedReasons = new Set(Object.keys(config.reasonTags || {}));
  const reasons: string[] = [];
  const addReason = (reason: string) => {
    if (allowedReasons.has(reason) && !reasons.includes(reason)) reasons.push(reason);
  };

  let profile = config.decisionProfiles[0] || 'HD';

  if (typeof criticScore === 'number' && criticScore >= criticHigh) {
    profile = 'HighQuality-4K';
    addReason('crit');
  } else if (typeof criticScore === 'number' && criticScore <= criticBlock) {
    if (visualRich && intenseVisual && strongPopularity) {
      profile = 'Efficient-4K';
      addReason('vis');
      addReason('pop');
    } else {
      profile = 'HD';
      addReason('weak');
    }
  } else if (typeof criticScore === 'number' && criticScore >= criticMid) {
    if (strongPopularity && visualRich) {
      profile = 'HighQuality-4K';
      addReason('crit');
      addReason('pop');
      addReason('vis');
    } else {
      profile = 'Efficient-4K';
      addReason('crit');
      if (strongPopularity) addReason('pop');
      if (visualRich) addReason('vis');
      if (!strongPopularity || !visualRich) addReason('mix');
    }
  } else if (typeof criticScore === 'number' && criticScore >= criticLow) {
    if (strongPopularity) {
      profile = 'Efficient-4K';
      addReason('pop');
      addReason('crit');
    } else {
      profile = 'HD';
      addReason('weak');
    }
  } else if (typeof criticScore === 'number') {
    if (strongPopularity) {
      profile = 'Efficient-4K';
      addReason('pop');
      if (visualRich) addReason('vis');
    } else {
      profile = 'HD';
      addReason('weak');
    }
  } else {
    if (strongPopularity && visualRich) {
      profile = 'Efficient-4K';
      addReason('pop');
      addReason('vis');
    } else if (strongPopularity) {
      profile = 'HD';
      addReason('pop');
      addReason('weak');
    } else if (visualRich) {
      profile = 'HD';
      addReason('vis');
      addReason('weak');
    } else {
      profile = 'HD';
      addReason('weak');
    }
  }

  if (lowq) addReason('lowq');

  if (!reasons.length) {
    addReason('weak');
  }

  const ambiguous =
    typeof criticScore === 'number' &&
    criticScore >= criticMid - 1 &&
    criticScore <= criticMid + 1 &&
    popMid &&
    visualScore <= 1;

  const reasoningParts: string[] = [];
  if (reasons.includes('lowq') && currentQuality) reasoningParts.push(`current quality is ${currentQuality}`);
  if (reasons.includes('crit') && typeof criticScore === 'number') reasoningParts.push(`critic score ${criticScore}`);
  if (reasons.includes('pop') && typeof popularity === 'number') reasoningParts.push(`popularity index ${popularity}`);
  if (reasons.includes('vis') && visualMatches.length) {
    reasoningParts.push(`visual score ${visualScore} (genres ${visualMatches.join(', ')})`);
  }
  if (reasons.includes('weak')) {
    const missingParts: string[] = [];
    if (criticScore == null) missingParts.push('missing critic score');
    if (popularity == null) missingParts.push('missing popularity');
    if (typeof popularity === 'number' && popularity <= popularityLow) missingParts.push('low popularity');
    if (visualScore === 0) missingParts.push('no visual genres');
    if (!missingParts.length) {
      reasoningParts.push('limited signal');
    } else {
      reasoningParts.push(`limited signal (${missingParts.join(', ')})`);
    }
  }
  if (reasons.includes('mix')) reasoningParts.push('mixed signals');
  if (!reasoningParts.length) reasoningParts.push('limited signal');

  const maxSentences = config.policies?.reasoning?.maxSentences ?? 2;
  const reasoning = reasoningParts.length
    ? `Chose ${profile} because ${reasoningParts.join('; ')}.`
    : `Chose ${profile} due to limited signal.`;

  const sentenceMatch = reasoning.match(/[^.!?]+[.!?]*/g) || [reasoning];
  const trimmedReasoning = sentenceMatch.length > maxSentences ? sentenceMatch.slice(0, maxSentences).join(' ').trim() : reasoning;

  const allowedProfiles = config.decisionProfiles || [];
  const finalProfile = allowedProfiles.includes(profile) ? profile : allowedProfiles[0] || profile;

  return {
    decision: {
      profile: finalProfile,
      rules: reasons,
      reasoning: trimmedReasoning
    },
    ambiguous
  };
}

function resolveProfileId(profiles: QualityProfile[], name: string): number | undefined {
  return profiles.find((p) => p.name === name)?.id;
}

function mapTagIdsToLabels(tags: RadarrTag[], ids: number[]): string[] {
  const map = new Map(tags.map((t) => [t.id, t.label]));
  return ids.map((id) => map.get(id)).filter((label): label is string => Boolean(label));
}

async function run(batchSizeOverride?: number, verbose: boolean = false) {
  const config = loadConfig(baseDir);

  const cliBatch =
    typeof batchSizeOverride === 'number' && Number.isFinite(batchSizeOverride) ? batchSizeOverride : NaN;
  const envBatch = Number(process.env.QUALITY_BROKER_BATCH_SIZE || process.env.BATCH_SIZE);
  const override =
    Number.isFinite(cliBatch) && cliBatch > 0
      ? cliBatch
      : Number.isFinite(envBatch) && envBatch > 0
        ? envBatch
        : undefined;
  const batchSize = override ?? config.batchSize;

  console.log(`Batch Size: ${config.batchSize}`);
  console.log(`Batch Size Override: ${override ?? 'none'}`);
  console.log(`Batch Size Effective: ${batchSize}`);

  const radarr = new RadarrClient(config);
  const logger = new RunLogger(baseDir);
  const llmEnabled = config.llmPolicy?.enabled !== false;
  const agent = llmEnabled ? new LLMAgent(config) : undefined;
  const reasonDescriptions = config.reasonTags || {};
  const describeRules = (rules: string[]) => rules.map((rule) => reasonDescriptions[rule] || rule);

  const [profiles, tags, movies] = await Promise.all([radarr.getQualityProfiles(), radarr.getTags(), radarr.getMovies()]);

  const autoProfileId = resolveProfileId(profiles, config.autoAssignProfile);
  if (!autoProfileId) {
    throw new Error(`Auto assign profile '${config.autoAssignProfile}' not found in Radarr.`);
  }
  const reviseProfileName = (config.reviseQualityForProfile || '').trim();
  const reviseProfileId = reviseProfileName ? resolveProfileId(profiles, reviseProfileName) : undefined;
  if (reviseProfileName && !reviseProfileId) {
    throw new Error(`Revise profile '${reviseProfileName}' not found in Radarr.`);
  }

  const decisionProfileIds = config.decisionProfiles.map((name) => {
    const id = resolveProfileId(profiles, name);
    if (!id) throw new Error(`Decision profile '${name}' not found in Radarr.`);
    return { name, id };
  });

  const compareTitles = (a: RadarrMovie, b: RadarrMovie) => {
    const at = (a.title || '').toLowerCase();
    const bt = (b.title || '').toLowerCase();
    return at.localeCompare(bt, 'en', { numeric: true, sensitivity: 'base' });
  };

  const candidates = movies
    .filter((m) => {
      if (reviseProfileId) return m.qualityProfileId === reviseProfileId;
      return m.qualityProfileId === autoProfileId;
    })
    .sort(compareTitles)
    .slice(0, batchSize);

  if (!candidates.length) {
    console.log('No eligible movies found for quality-broker.');
    return;
  }

  const runLog: RunLogEntry[] = [];
  let successCount = 0;
  let finalized = false;

  const finalize = (extra?: { reason?: string }) => {
    if (finalized) return;
    finalized = true;
    const logPath = logger.writeLog(runLog);
    const failedCount = runLog.length - successCount;
    const summary = {
      runAt: new Date().toISOString(),
      batchSize,
      processed: runLog.length,
      succeeded: successCount,
      failed: failedCount,
      logPath,
      ...(extra?.reason ? { reason: extra.reason } : {})
    };
    logger.writeStatus(summary);
    return logPath;
  };

  const finalizeOnSignal = (reason: string) => () => finalize({ reason });
  process.on('SIGINT', finalizeOnSignal('SIGINT'));
  process.on('SIGTERM', finalizeOnSignal('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error(err);
    finalize({ reason: `uncaughtException: ${(err as Error).message}` });
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    console.error(err);
    finalize({ reason: `unhandledRejection: ${String(err)}` });
    process.exit(1);
  });
  const shouldDelayBetween = candidates.length > 100;
  const interRequestDelayMs = 1500;
  const interRequestDelaySeconds = (interRequestDelayMs / 1000).toFixed(1);

  if (verbose) {
    console.log(`[Verbose] Processing ${candidates.length} candidate(s).`);
    if (shouldDelayBetween) {
      console.log(`[Verbose] Large queue detected; delaying ${interRequestDelaySeconds}s between requests.`);
    }
  }

  for (const movie of candidates) {
    let decisionSourceForLog: 'deterministic_rule' | 'llm' = 'deterministic_rule';
    const fromProfile = profiles.find((p) => p.id === movie.qualityProfileId)?.name || 'unknown';
    const currentQuality = movie.movieFile?.quality?.quality?.name;
    const criticScore = getCriticScore(movie);
    const criticScoreSource = getCriticScoreSource(movie);
    const tomatoScore = getTomatoScore(movie);
    const tomatoVotes = getTomatoVotes(movie);
    const rtCriticScore = getRtCriticScore(movie);
    const rtCriticVotes = getRtCriticVotes(movie);
    const metacriticScore = getMetacriticScore(movie);
      const popularity = buildPopularitySignal(movie);
      const popularityValue =
        typeof popularity.computedPopularityIndex === 'number' ? popularity.computedPopularityIndex : getPopularity(movie);
      const popularityTier = computePopularityTier(popularityValue, config.thresholds);
    const keywords = movie.keywords;

    try {
      if (verbose) {
        const signalSummary = {
          popularity,
          metacriticScore,
          rtAudienceScore: tomatoScore,
          rtAudienceVotes: tomatoVotes,
          rtCriticScore,
          rtCriticVotes,
          criticScore,
          criticScoreSource,
          currentQuality,
        };
        console.log(`[Verbose] Signals for ${movie.title}: ${JSON.stringify(signalSummary)}`);
      }

      const deterministic = selectDeterministicDecision({ movie, config });
      let decision: DecisionResult = deterministic.decision;
      let decisionSource: 'deterministic_rule' | 'llm' = 'deterministic_rule';

      const useLlm =
        llmEnabled &&
        agent &&
        (config.llmPolicy?.useOnAmbiguousOnly === false ? true : deterministic.ambiguous);

      if (useLlm) {
        decision = await agent.decide({
          movie,
          profileOptions: config.decisionProfiles,
          autoAssignProfile: config.autoAssignProfile
        });
        decisionSource = 'llm';
      }
      decisionSourceForLog = decisionSource;
      if (verbose) {
        const decisionLog = {
          profile: decision.profile,
          rules: decision.rules,
          reasoning: decision.reasoning,
          ...(typeof decision.popularityTier === 'string' ? { popularityTier: decision.popularityTier } : {}),
          decisionSource
        };
        console.log(
          `[Verbose] Decision for ${movie.title}: ${JSON.stringify(decisionLog)}`
        );
      }
      const currentIs4k = is4kQuality(currentQuality);
      const blockDowngrade =
        decision.profile === 'HD' && currentIs4k && config.downgradeQualityProfile !== true;
      if (blockDowngrade && !decision.rules.includes('exceed')) {
        const exceedTarget =
          fromProfile === config.autoAssignProfile
            ? (config.decisionProfiles.includes('Efficient-4K') ? 'Efficient-4K' : decision.profile)
            : fromProfile;
        decision = {
          ...decision,
          profile: exceedTarget,
          rules: [...decision.rules, 'exceed'],
          reasoning: `${decision.reasoning} Exceeding-quality file detected (2160p); downgrade blocked.`
        };
      }

      const result = await applyDecision({
        decision,
        movie,
        radarr,
        tags,
        decisionProfileIds,
        config
      });
      if (verbose) {
        console.log(`[Verbose] Tags for ${movie.title}: ${JSON.stringify(result.tagsAdded)}`);
      }

      successCount += 1;
      runLog.push({
        radarrMovieId: movie.id,
        title: movie.title,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        popularity,
        popularityTier,
        metacriticScore,
        rtAudienceScore: tomatoScore,
        rtAudienceVotes: tomatoVotes,
        rtCriticScore,
        rtCriticVotes,
        criticScoreSource,
        currentQuality,
        criticScore,
        keywords,
        fromProfile,
        toProfile: decision.profile,
        rulesApplied: describeRules(decision.rules),
        tagsAdded: result.tagsAdded,
        reasoning: decision.reasoning,
        decisionSource: decisionSourceForLog,
        success: true
      });
    } catch (err) {
      runLog.push({
        radarrMovieId: movie.id,
        title: movie.title,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        popularity,
        popularityTier,
        metacriticScore,
        rtAudienceScore: tomatoScore,
        rtAudienceVotes: tomatoVotes,
        rtCriticScore,
        rtCriticVotes,
        criticScoreSource,
        currentQuality,
        criticScore,
        keywords,
        fromProfile,
        toProfile: fromProfile,
        rulesApplied: [],
        tagsAdded: [],
        reasoning: '',
        decisionSource: decisionSourceForLog,
        success: false,
        error: (err as Error).message
      });
      console.error(`Failed processing ${movie.title}: ${(err as Error).message}`);
    }

    if (shouldDelayBetween) {
      if (verbose) {
        console.log(`[Verbose] Waiting ${interRequestDelaySeconds}s before next request.`);
      }
      await sleep(interRequestDelayMs);
    }
  }

  const logPath = finalize();

  const { default: chalk } = await import('chalk');
  const failedCount = candidates.length - successCount;
  const statusText = failedCount === 0 ? chalk.green('Success') : chalk.red('Completed with failures');
  const counts = `${chalk.green(String(successCount))} succeeded, ${failedCount > 0 ? chalk.red(String(failedCount)) : '0'} failed`;
  console.log(`Run complete. ${statusText}: ${counts} out of ${candidates.length}. Log: ${logPath}`);
}

async function applyDecision(params: {
  decision: DecisionResult;
  movie: RadarrMovie;
  radarr: RadarrClient;
  tags: RadarrTag[];
  decisionProfileIds: { name: string; id: number }[];
  config: BrokerConfig;
}) {
  const { decision, movie, radarr, tags, decisionProfileIds, config } = params;

  const profileId = decisionProfileIds.find((p) => p.name === decision.profile)?.id;
  if (!profileId) throw new Error(`Profile id not found for ${decision.profile}`);

  const normalizeLabel = (value: string) => {
    const normalized = `${value}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || `tag-${Date.now()}`;
  };

  const allowedReasons = new Set(Object.keys(config.reasonTags || {}));
  let mappedReasons = decision.rules.filter((r) => allowedReasons.has(r));
  if (!mappedReasons.length && allowedReasons.size) {
    const fallback = Array.from(allowedReasons)[0];
    if (fallback !== undefined) {
      mappedReasons = [fallback];
    } else {
      mappedReasons = [];
    }
  }
  if (!mappedReasons.length) throw new Error('No mapped reasons for tagging; decision skipped.');

  const requiredTagLabels = mappedReasons.map((t) => normalizeLabel(t));
  const existing = await radarr.getTags();
  const ensured = [...existing];

  const brokerManagedLabels = new Set(Array.from(allowedReasons).map((t) => normalizeLabel(t)));
  const preservedTagIds = movie.tags.filter((id) => {
    const label = existing.find((t) => t.id === id)?.label;
    return label && !brokerManagedLabels.has(normalizeLabel(label));
  });

  const tagIds: number[] = [...preservedTagIds];
  const addedLabels: string[] = [];
  for (const label of requiredTagLabels) {
    const tag = await radarr.ensureTag(label, ensured);
    if (!tagIds.includes(tag.id)) {
      tagIds.push(tag.id);
      addedLabels.push(label);
    }
  }

  const updatedMovie = {
    ...movie,
    qualityProfileId: profileId,
    tags: tagIds
  };
  await radarr.updateMovie(updatedMovie);

  const tagLabelsAfter = mapTagIdsToLabels([...ensured, ...tags], tagIds);
  return { tagsAdded: addedLabels.length ? addedLabels : tagLabelsAfter };
}

const program = new Command();
program.name('quality-broker').description('Radarr quality broker with LLM-guided profile decisions');

program
  .command('run')
  .description('Run a batch now')
  .option('--batch-size <n>', 'Override batch size')
  .option('--verbose', 'Log detailed per-movie signals and decisions')
  .action(async (opts) => {
    try {
      const batchSize = opts.batchSize ? parseInt(String(opts.batchSize), 10) : undefined;
      await run(batchSize, Boolean(opts.verbose));
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
