#!/usr/bin/env node
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { loadConfig } from './config.js';
import { LLMAgent } from './llmAgent.js';
import { RunLogger } from './logger.js';
import { RadarrClient } from './radarrClient.js';
import { createRulesEngine } from './rulesEngine.js';
import {
  buildPopularitySignal,
  computePopularityTier,
  getCriticScore,
  getCriticScoreSource,
  getMetacriticScore,
  getPopularity,
  getRtCriticScore,
  getRtCriticVotes,
  getTomatoScore,
  getTomatoVotes,
  is4kQuality
} from './signals.js';
import { BrokerConfig, DecisionResult, QualityProfile, RadarrMovie, RadarrTag, RunLogEntry } from './types.js';

const baseDir = fileURLToPath(new URL('..', import.meta.url));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProfileId(profiles: QualityProfile[], name: string): number | undefined {
  return profiles.find((p) => p.name === name)?.id;
}

function mapTagIdsToLabels(tags: RadarrTag[], ids: number[]): string[] {
  const map = new Map(tags.map((t) => [t.id, t.label]));
  return ids.map((id) => map.get(id)).filter((label): label is string => Boolean(label));
}

function formatInfoLine(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
  const llmEnabled = config.policyForAmbiguousCases?.useLLM !== false;
  const agent = llmEnabled ? new LLMAgent(config) : undefined;
  const reasonDescriptions = config.reasonTags || {};
  const rulesEngine = createRulesEngine(config);
  const describeRules = (decision: DecisionResult, source: 'deterministic_rule' | 'llm') => {
    if (decision.ruleName) return [decision.ruleName];
    if (source === 'llm') return ['llm_decision'];
    if (decision.profile === config.autoAssignProfile) return ['ambiguous_fallback'];
    if (source === 'deterministic_rule') {
      const tier =
        decision.profile === 'HighQuality-4K' ? 'high' : decision.profile === 'Efficient-4K' ? 'mid' : 'low';
      return [`score_${tier}`];
    }
    return decision.rules.map((rule) => reasonDescriptions[rule] || rule);
  };

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
    const logPath = logger.checkpoint(runLog, true);
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
  const llmDelayMs = typeof config.llmRequestDelayMs === 'number' ? config.llmRequestDelayMs : 0;
  const interRequestDelaySeconds = (llmDelayMs / 1000).toFixed(1);

  if (verbose) {
    console.log(`[Verbose] Processing ${candidates.length} candidate(s).`);
  }

  logger.initLog();

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
    const genres = Array.isArray(movie.genres) ? movie.genres : [];

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

      const deterministic = await rulesEngine.decide(movie);
      let decision: DecisionResult = deterministic.decision;
      let decisionSource: 'deterministic_rule' | 'llm' = 'deterministic_rule';

      const useLlm = llmEnabled && agent && Boolean(deterministic.decision.ambiguous);

      let skipUpdate = false;

      if (useLlm) {
        if (verbose && llmDelayMs > 0) {
          console.log(`[Verbose] LLM delay: waiting ${interRequestDelaySeconds}s before request.`);
        }
        if (llmDelayMs > 0) {
          await sleep(llmDelayMs);
        }
        decision = await agent.decide({
          movie,
          profileOptions: config.decisionProfiles,
          autoAssignProfile: config.autoAssignProfile
        });
        decisionSource = 'llm';
      } else if (deterministic.decision.ambiguous) {
        const fallbackProfile =
          config.policyForAmbiguousCases?.noLLMFallbackProfile || config.autoAssignProfile;
        if (fallbackProfile === config.autoAssignProfile) {
          decision = {
            ...decision,
            profile: fromProfile,
            ruleName: 'ambiguous_fallback',
            reasoning: 'Ambiguous signals; LLM disabled; leaving profile unchanged.'
          };
          skipUpdate = true;
        } else if (!config.decisionProfiles.includes(fallbackProfile)) {
          throw new Error(
            `Ambiguous signals; noLLMFallbackProfile '${fallbackProfile}' is not in decisionProfiles.`
          );
        } else {
          decision = {
            ...decision,
            profile: fallbackProfile,
            ruleName: 'ambiguous_fallback',
            reasoning: `Ambiguous signals; LLM disabled; using fallback profile ${fallbackProfile}.`
          };
        }
      }
      decisionSourceForLog = decisionSource;
      if (verbose) {
        const decisionLog = {
          profile: decision.profile,
          rules: decision.rules,
          reasoning: decision.reasoning,
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

      if (!skipUpdate) {
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
          genres,
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
          rulesApplied: describeRules(decision, decisionSourceForLog),
          tagsAdded: result.tagsAdded,
          reasoning: decision.reasoning,
          decisionSource: decisionSourceForLog,
          success: true
        });
        console.log(
          `INFO decision title="${formatInfoLine(movie.title || 'unknown')}" decision=${formatInfoLine(decision.profile)} source=${decisionSourceForLog} reasoning="${formatInfoLine(decision.reasoning)}"`
        );
        logger.checkpoint(runLog);
      } else {
        successCount += 1;
        runLog.push({
          radarrMovieId: movie.id,
          title: movie.title,
          imdbId: movie.imdbId,
          tmdbId: movie.tmdbId,
          popularity,
          popularityTier,
          genres,
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
          rulesApplied: describeRules(decision, decisionSourceForLog),
          tagsAdded: [],
          reasoning: decision.reasoning,
          decisionSource: decisionSourceForLog,
          success: true
        });
        console.log(
          `INFO decision title="${formatInfoLine(movie.title || 'unknown')}" decision=${formatInfoLine(decision.profile)} source=${decisionSourceForLog} reasoning="${formatInfoLine(decision.reasoning)}"`
        );
        logger.checkpoint(runLog);
      }
    } catch (err) {
      runLog.push({
        radarrMovieId: movie.id,
        title: movie.title,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        popularity,
        popularityTier,
        genres,
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
      logger.checkpoint(runLog);
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
