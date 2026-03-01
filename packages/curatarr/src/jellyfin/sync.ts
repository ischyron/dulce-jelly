/**
 * Jellyfin → SQLite sync
 * Reads Jellyfin movie metadata and enriches the movies table.
 * Match strategy: path > IMDb ID > title+year (in order of reliability).
 * Ambiguous matches (year or title mismatch after normalization) are flagged.
 * Never writes back to Jellyfin.
 */

import path from 'node:path';
import type { CuratDb, MovieRow } from '../db/client.js';
import type { JellyfinClient, JfMovie } from './client.js';
import { DisambiguationEngine } from '../disambiguation/engine.js';
import type { DisambiguateResult } from '../disambiguation/types.js';

export interface SyncOptions {
  onProgress?: (synced: number, total: number, matched: number, unmatched: number) => void;
  /** Callback for ambiguous matches that need human review. */
  onAmbiguous?: (item: AmbiguousMatch) => void;
  /** If true, re-sync movies already enriched. Default: false. */
  resync?: boolean;
}

export interface AmbiguousMatch {
  jfTitle: string;
  jfYear: number | undefined;
  dbFolderName: string;
  dbParsedYear: number | null;
  reason: 'year_mismatch' | 'title_fuzzy' | 'year_and_title_fuzzy';
  matchMethod: 'title_only';
}

// Re-export for external consumers
export type { DisambiguateResult };

export interface SyncResult {
  total: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  errors: string[];
  unmatchedJfTitles: string[];
  ambiguousMatches: AmbiguousMatch[];
}

// ──────────────────────────────────────────────────────────────────
// Path normalisation helpers
// ──────────────────────────────────────────────────────────────────

/**
 * Get the "effective folder path" for a Jellyfin movie.
 * Jellyfin's Path points to the video file — we want the parent folder.
 */
function jfFolderPath(jfMovie: JfMovie): string | undefined {
  const p = jfMovie.Path ?? jfMovie.MediaSources?.[0]?.Path;
  if (!p) return undefined;
  return path.dirname(p);
}

// ──────────────────────────────────────────────────────────────────
// Adapter: DisambiguateResult → MatchResult
// ──────────────────────────────────────────────────────────────────

interface MatchResult {
  movie: MovieRow;
  ambiguous?: AmbiguousMatch;
}

function disResultToMatchResult(
  result: DisambiguateResult,
  dbMovies: MovieRow[],
  jf: JfMovie
): MatchResult | undefined {
  if (!result.match) return undefined;
  const movie = dbMovies.find(m => m.id === result.match!.movieId);
  if (!movie) return undefined;

  let ambiguous: AmbiguousMatch | undefined;
  if (result.ambiguous && result.ambiguousReason) {
    ambiguous = {
      jfTitle: jf.Name,
      jfYear: jf.ProductionYear,
      dbFolderName: movie.folder_name,
      dbParsedYear: movie.parsed_year,
      reason: result.ambiguousReason,
      matchMethod: 'title_only',
    };
  }
  return { movie, ambiguous };
}

// ──────────────────────────────────────────────────────────────────
// Main sync function
// ──────────────────────────────────────────────────────────────────

export async function syncJellyfin(
  jfClient: JellyfinClient,
  db: CuratDb,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    errors: [],
    unmatchedJfTitles: [],
    ambiguousMatches: [],
  };

  // Load all DB movies into memory for matching
  const dbMovies = db.getAllMovies();
  const dbByFolder = new Map(dbMovies.map(m => [m.folder_path, m]));
  const engine = new DisambiguationEngine(dbMovies);

  console.log(`  DB has ${dbMovies.length} movies to match against`);

  // Fetch all Jellyfin movies
  let jfMovies: JfMovie[];
  try {
    const fetchResult = await jfClient.getAllMovies({
      onProgress: (f, t) => process.stdout.write(`\r  Fetching from Jellyfin: ${f}/${t}   `),
    });
    jfMovies = fetchResult.movies;
    if (fetchResult.errors.length > 0) result.errors.push(...fetchResult.errors);
    process.stdout.write('\n');
  } catch (err) {
    result.errors.push(`Failed to fetch Jellyfin movies: ${(err as Error).message}`);
    return result;
  }

  result.total = jfMovies.length;
  console.log(`  Fetched ${jfMovies.length} movies from Jellyfin`);

  let synced = 0;
  for (const jf of jfMovies) {
    // Skip already-synced unless resync requested
    if (!opts.resync) {
      const folderPath = jfFolderPath(jf);
      if (folderPath) {
        const existing = dbByFolder.get(folderPath);
        if (existing?.jf_synced_at) {
          result.matched++;
          synced++;
          continue;
        }
      }
    }

    const folderPath2 = jfFolderPath(jf);
    const disResult = engine.disambiguate({
      id: jf.Id,
      title: jf.Name,
      year: jf.ProductionYear,
      imdbId: jf.ProviderIds?.Imdb,
      folderPath: folderPath2,
    });
    const matchResult = disResultToMatchResult(disResult, dbMovies, jf);

    if (!matchResult) {
      result.unmatched++;
      result.unmatchedJfTitles.push(`${jf.Name} (${jf.ProductionYear ?? '?'})`);
      continue;
    }

    // Track ambiguous matches
    if (matchResult.ambiguous) {
      result.ambiguous++;
      result.ambiguousMatches.push(matchResult.ambiguous);
      if (opts.onAmbiguous) opts.onAmbiguous(matchResult.ambiguous);
      // Still enrich, but flag the mismatch in errors for visibility
      result.errors.push(
        `Ambiguous (${matchResult.ambiguous.reason}): JF "${jf.Name}" (${jf.ProductionYear ?? '?'}) ` +
        `→ DB "${matchResult.ambiguous.dbFolderName}" (${matchResult.ambiguous.dbParsedYear ?? '?'})`
      );
    }

    // Enrich the DB row
    const ok = db.enrichFromJellyfin(matchResult.movie.folder_path, {
      jellyfinId: jf.Id,
      jellyfinTitle: jf.Name,
      jellyfinYear: jf.ProductionYear,
      imdbId: jf.ProviderIds?.Imdb,
      tmdbId: jf.ProviderIds?.Tmdb,
      criticRating: jf.CriticRating,
      communityRating: jf.CommunityRating,
      genres: jf.Genres,
      overview: jf.Overview,
      jellyfinPath: jf.Path ?? jf.MediaSources?.[0]?.Path,
    });

    if (ok) {
      result.matched++;
    } else {
      result.errors.push(`DB update failed for: ${matchResult.movie.folder_path}`);
    }

    synced++;
    if (opts.onProgress) {
      opts.onProgress(synced, result.total, result.matched, result.unmatched);
    }
  }

  return result;
}
