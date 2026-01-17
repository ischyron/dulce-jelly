#!/usr/bin/env node
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { loadConfig } from './config.js';
import { LLMAgent } from './llmAgent.js';
import { RadarrClient } from './radarrClient.js';
import { RunLogger } from './logger.js';
import {
  DecisionResult,
  QualityProfile,
  RadarrMovie,
  RadarrTag,
  RunLogEntry,
  RunSummary
} from './types.js';

const baseDir = fileURLToPath(new URL('..', import.meta.url));

function resolveProfileId(profiles: QualityProfile[], name: string): number | undefined {
  return profiles.find((p) => p.name === name)?.id;
}

function mapTagIdsToLabels(tags: RadarrTag[], ids: number[]): string[] {
  const map = new Map(tags.map((t) => [t.id, t.label] as const));
  return ids.map((id) => map.get(id)).filter(Boolean) as string[];
}

async function run(batchSizeOverride?: number) {
  const config = loadConfig(baseDir);
  const cliBatch = typeof batchSizeOverride === 'number' && Number.isFinite(batchSizeOverride)
    ? batchSizeOverride
    : NaN;
  const envBatch = Number(process.env.QUALITY_BROKER_BATCH_SIZE || process.env.BATCH_SIZE);
  const override = Number.isFinite(cliBatch) && cliBatch > 0
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

  const [profiles, tags, movies] = await Promise.all([
    radarr.getQualityProfiles(),
    radarr.getTags(),
    radarr.getMovies()
  ]);

  const autoProfileId = resolveProfileId(profiles, config.autoAssignProfile);
  if (!autoProfileId) {
    throw new Error(`Auto assign profile '${config.autoAssignProfile}' not found in Radarr.`);
  }
  const decisionProfileIds = config.decisionProfiles.map((name) => {
    const id = resolveProfileId(profiles, name);
    if (!id) throw new Error(`Decision profile '${name}' not found in Radarr.`);
    return { name, id };
  });

  const tagsById = new Map(tags.map((t) => [t.id, t.label] as const));
  const hasDecisionTag = (movie: RadarrMovie) =>
    movie.tags.some((tid) => (tagsById.get(tid) || '').startsWith('demand-'));

  const candidates = movies
    .filter((m) => m.qualityProfileId === autoProfileId && !hasDecisionTag(m))
    .slice(0, batchSize);

  if (!candidates.length) {
    console.log('No eligible movies found for quality-broker.');
    return;
  }

  const runLog: RunLogEntry[] = [];
  let successCount = 0;
  for (const movie of candidates) {
    const fromProfile = profiles.find((p) => p.id === movie.qualityProfileId)?.name || 'unknown';
    const currentQuality = movie.movieFile?.quality?.quality?.name;
    const criticScore = movie.ratings?.rottenTomatoes?.value;
    const popularity = movie.popularity ?? movie.tmdbPopularity;
    const releaseGroup = movie.releaseGroup;
    const keywords = movie.keywords;
    try {
    const decision = await agent.decide({
      movie,
      profileOptions: config.decisionProfiles,
      autoAssignProfile: config.autoAssignProfile
    });
      const result = await applyDecision({
        decision,
        movie,
        radarr,
        tags,
        decisionProfileIds,
        config
      });
      successCount += 1;
      runLog.push({
        radarrMovieId: movie.id,
        title: movie.title,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        popularity,
        currentQuality,
        criticScore,
        releaseGroup,
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
        currentQuality,
        criticScore,
        releaseGroup,
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
  }

  const logPath = logger.writeLog(runLog);
  const failedCount = candidates.length - successCount;
  const summary: RunSummary = {
    runAt: new Date().toISOString(),
    batchSize,
    processed: candidates.length,
    succeeded: successCount,
    failed: failedCount,
    logPath
  };
  logger.writeStatus(summary);
  const { default: chalk } = await import('chalk');

  // Format output with proper coloring
  const statusText = failedCount === 0
    ? chalk.green('Success')
    : chalk.red('Completed with failures');
  const counts = `${chalk.green(String(successCount))} succeeded, ${failedCount > 0 ? chalk.red(String(failedCount)) : '0'} failed`;
  console.log(`Run complete. ${statusText}: ${counts} out of ${candidates.length}. Log: ${logPath}`);
}

async function applyDecision(params: {
  decision: DecisionResult;
  movie: RadarrMovie;
  radarr: RadarrClient;
  tags: RadarrTag[];
  decisionProfileIds: { name: string; id: number }[];
  config: any;
}): Promise<{ tagsAdded: string[] }> {
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

  const allowedReasons = new Set<string>(Object.keys(config.reasonTags || {}));
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
  const ensured: RadarrTag[] = [...existing];
  const tagIds: number[] = []; // replace all tags with the new set
  const addedLabels: string[] = [];
  for (const label of requiredTagLabels) {
    const tag = await radarr.ensureTag(label, ensured);
    if (!tagIds.includes(tag.id)) {
      tagIds.push(tag.id);
      addedLabels.push(label);
    }
  }

  const updatedMovie: RadarrMovie = {
    ...movie,
    qualityProfileId: profileId,
    tags: tagIds
  };

  await radarr.updateMovie(updatedMovie);

  const tagLabelsAfter = mapTagIdsToLabels([...ensured, ...tags], tagIds);
  return { tagsAdded: addedLabels.length ? addedLabels : tagLabelsAfter };
}

const program = new Command();
program
  .name('quality-broker')
  .description('Radarr quality broker with LLM-guided profile decisions')
  .option('--batch-size <n>', 'Override batch size', (v) => parseInt(v, 10))
  .action(async (opts) => {
    try {
      await run(opts.batchSize);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Run a batch now')
  .option('--batch-size <n>', 'Override batch size', (v) => parseInt(v, 10))
  .action(async (opts) => {
    try {
      await run(opts.batchSize);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
