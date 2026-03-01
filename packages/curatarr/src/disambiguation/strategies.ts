/**
 * Disambiguation strategies — 5 pure functions, no side effects.
 * Each takes a request + DB movie snapshot and returns a result or undefined.
 */

import type { MovieRow } from '../db/client.js';
import type { DisambiguateRequest, DisambiguateResult } from './types.js';

// ── Normalisation helpers ──────────────────────────────────────────

/** Normalise title for fuzzy comparison */
export function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(\d{4}\)\s*$/, '')  // strip trailing "(year)"
    .replace(/^the\s+/, '')            // strip leading "The "
    .replace(/[^\w\s]/g, '')           // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute a simple character-overlap similarity (0..1) */
export function titleSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  let matches = 0;
  const used = new Set<number>();
  for (const ch of shorter) {
    const idx = longer.split('').findIndex((c, i) => c === ch && !used.has(i));
    if (idx >= 0) { matches++; used.add(idx); }
  }
  return matches / longer.length;
}

function makeMatch(req: DisambiguateRequest, m: MovieRow): DisambiguateResult['match'] {
  return {
    movieId: m.id,
    folderPath: m.folder_path,
    parsedTitle: m.parsed_title,
    parsedYear: m.parsed_year,
  };
}

// ── Strategy functions ─────────────────────────────────────────────

export function strategyPath(
  req: DisambiguateRequest,
  dbMovies: MovieRow[]
): DisambiguateResult | undefined {
  if (!req.folderPath) return undefined;
  const m = dbMovies.find(m => m.folder_path === req.folderPath);
  if (!m) return undefined;
  return {
    requestId: req.id,
    match: makeMatch(req, m),
    confidence: 1.0,
    method: 'path',
    ambiguous: false,
  };
}

export function strategyImdb(
  req: DisambiguateRequest,
  dbMovies: MovieRow[]
): DisambiguateResult | undefined {
  if (!req.imdbId) return undefined;
  const m = dbMovies.find(m => m.imdb_id === req.imdbId);
  if (!m) return undefined;
  return {
    requestId: req.id,
    match: makeMatch(req, m),
    confidence: 1.0,
    method: 'imdb',
    ambiguous: false,
  };
}

export function strategyTitleYear(
  req: DisambiguateRequest,
  dbMovies: MovieRow[]
): DisambiguateResult | undefined {
  if (!req.year) return undefined;
  const reqNorm = normTitle(req.title);
  const m = dbMovies.find(m => {
    if (m.parsed_year !== req.year && m.jellyfin_year !== req.year) return false;
    return normTitle(m.parsed_title ?? m.folder_name) === reqNorm;
  });
  if (!m) return undefined;
  return {
    requestId: req.id,
    match: makeMatch(req, m),
    confidence: 0.95,
    method: 'title_year',
    ambiguous: false,
  };
}

export function strategyTitleOnly(
  req: DisambiguateRequest,
  dbMovies: MovieRow[]
): DisambiguateResult | undefined {
  const reqNorm = normTitle(req.title);
  const m = dbMovies.find(m => normTitle(m.parsed_title ?? m.folder_name) === reqNorm);
  if (!m) return undefined;
  const yearMismatch = req.year != null && m.parsed_year != null && m.parsed_year !== req.year;
  return {
    requestId: req.id,
    match: makeMatch(req, m),
    confidence: 0.75,
    method: 'title_only',
    ambiguous: yearMismatch,
    ambiguousReason: yearMismatch ? 'year_mismatch' : undefined,
  };
}

export function strategyFuzzy(
  req: DisambiguateRequest,
  dbMovies: MovieRow[]
): DisambiguateResult | undefined {
  const reqNorm = normTitle(req.title);
  const candidates = dbMovies
    .map(m => {
      const dbNorm = normTitle(m.parsed_title ?? m.folder_name);
      return { m, sim: titleSimilarity(reqNorm, dbNorm) };
    })
    .filter(x => x.sim >= 0.85)
    .sort((a, b) => b.sim - a.sim);

  if (candidates.length === 0) return undefined;
  const best = candidates[0];
  const yearMismatch = req.year != null && best.m.parsed_year != null && best.m.parsed_year !== req.year;
  const reason: DisambiguateResult['ambiguousReason'] = yearMismatch
    ? 'year_and_title_fuzzy'
    : 'title_fuzzy';
  return {
    requestId: req.id,
    match: makeMatch(req, best.m),
    confidence: best.sim * 0.9,
    method: 'fuzzy',
    ambiguous: true,
    ambiguousReason: reason,
  };
}
