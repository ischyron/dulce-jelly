#!/usr/bin/env node
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { loadConfig } from './config.js';
import { LLMAgent } from './llmAgent.js';
import { RunLogger } from './logger.js';
import { RadarrClient } from './radarrClient.js';
import { BrokerConfig, DecisionResult, PopularitySignal, QualityProfile, RadarrMovie, RadarrTag } from './types.js';

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

  return {
    primarySource,
    primaryScore: typeof primaryScore === 'number' ? primaryScore : undefined,
    primaryVotes: typeof primaryVotes === 'number' ? primaryVotes : undefined,
    tmdbScore: typeof tmdbScore === 'number' ? tmdbScore : undefined,
    tmdbVotes: typeof tmdbVotes === 'number' ? tmdbVotes : undefined,
    imdbScore: typeof imdbScore === 'number' ? imdbScore : undefined,
    imdbVotes: typeof imdbVotes === 'number' ? imdbVotes : undefined,
    rawPopularity: typeof rawPopularity === 'number' ? rawPopularity : undefined
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
  const agent = new LLMAgent(config);

  const [profiles, tags, movies] = await Promise.all([radarr.getQualityProfiles(), radarr.getTags(), radarr.getMovies()]);

  const autoProfileId = resolveProfileId(profiles, config.autoAssignProfile);
  if (!autoProfileId) {
    throw new Error(`Auto assign profile '${config.autoAssignProfile}' not found in Radarr.`);
  }

  const decisionProfileIds = config.decisionProfiles.map((name) => {
    const id = resolveProfileId(profiles, name);
    if (!id) throw new Error(`Decision profile '${name}' not found in Radarr.`);
    return { name, id };
  });

  const tagsById = new Map(tags.map((t) => [t.id, t.label]));
  const hasDecisionTag = (movie: RadarrMovie) =>
    movie.tags.some((tid) => (tagsById.get(tid) || '').startsWith('demand-'));

  const candidates = movies
    .filter((m) => m.qualityProfileId === autoProfileId && !hasDecisionTag(m))
    .slice(0, batchSize);

  if (!candidates.length) {
    console.log('No eligible movies found for quality-broker.');
    return;
  }

  const runLog = [];
  let successCount = 0;
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

      const decision = await agent.decide({
        movie,
        profileOptions: config.decisionProfiles,
        autoAssignProfile: config.autoAssignProfile
      });
      if (verbose) {
        const decisionLog = {
          profile: decision.profile,
          rules: decision.rules,
          reasoning: decision.reasoning,
          ...(typeof decision.popularityTier === 'string' ? { popularityTier: decision.popularityTier } : {})
        };
        console.log(
          `[Verbose] Decision for ${movie.title}: ${JSON.stringify(decisionLog)}`
        );
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
        rulesApplied: decision.rules,
        tagsAdded: result.tagsAdded,
        reasoning: decision.reasoning,
        success: true
      });
    } catch (err) {
      runLog.push({
        radarrMovieId: movie.id,
        title: movie.title,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        popularity,
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

  const logPath = logger.writeLog(runLog);
  const failedCount = candidates.length - successCount;
  const summary = {
    runAt: new Date().toISOString(),
    batchSize,
    processed: candidates.length,
    succeeded: successCount,
    failed: failedCount,
    logPath
  };
  logger.writeStatus(summary);

  const { default: chalk } = await import('chalk');
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
