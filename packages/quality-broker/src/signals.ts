import { BrokerConfig, PopularitySignal, RadarrMovie } from './types.js';

export function getCriticScore(movie: RadarrMovie): number | undefined {
  return (
    movie.criticScore ??
    movie.ratings?.rtCritic?.value ??
    movie.ratings?.metacritic?.value ??
    movie.rottenTomatoesCriticScore ??
    undefined
  );
}

export function getCriticScoreSource(movie: RadarrMovie): string | undefined {
  if (typeof movie.criticScore === 'number') return 'criticScore';
  if (typeof movie.ratings?.metacritic?.value === 'number') return 'metacritic';
  if (typeof movie.ratings?.rtCritic?.value === 'number') return 'rtCritic';
  if (typeof movie.rottenTomatoesCriticScore === 'number') return 'rtCriticLegacy';
  return undefined;
}

export function isLowQ(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /(480p|576p|720p)/i.test(currentQuality);
}

export function is4kQuality(currentQuality?: string): boolean {
  if (!currentQuality) return false;
  return /2160p/i.test(currentQuality);
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function matchVisualGenres(genres: string[], visualGenresHigh: string[]): string[] {
  if (!genres.length || !visualGenresHigh.length) return [];
  const set = new Set(visualGenresHigh.map(normalizeName));
  return genres.filter((g) => set.has(normalizeName(g)));
}

export function computeVisualScore(
  matches: string[],
  weights: Record<string, number>,
  maxScore: number
): number {
  if (!matches.length) return 0;
  const total = matches.reduce((sum, g) => {
    const key = normalizeName(g);
    return sum + (weights[key] ?? 0);
  }, 0);
  return Math.min(maxScore, total);
}

export function getPopularity(movie: RadarrMovie): number | undefined {
  const p = movie.popularity ?? movie.tmdbPopularity;
  return typeof p === 'number' ? p : undefined;
}

export function getTmdbVotes(movie: RadarrMovie): number | undefined {
  const v = movie.ratings?.tmdb?.votes ?? movie.ratings?.tmdb?.voteCount ?? movie.tmdbVotes;
  return typeof v === 'number' ? v : undefined;
}

export function getTomatoScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rottenTomatoes?.value ?? movie.rottenTomatoesCriticScore ?? undefined;
}

export function getRtCriticScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rtCritic?.value ?? undefined;
}

export function getTomatoVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rottenTomatoes?.votes ?? undefined;
}

export function getRtCriticVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.rtCritic?.votes ?? undefined;
}

export function getMetacriticScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.metacritic?.value ?? undefined;
}

export function getImdbScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.imdb?.value ?? undefined;
}

export function getImdbVotes(movie: RadarrMovie): number | undefined {
  return movie.ratings?.imdb?.votes ?? undefined;
}

export function getTmdbScore(movie: RadarrMovie): number | undefined {
  return movie.ratings?.tmdb?.value ?? undefined;
}

export function computePopularityIndex(votes?: number): number | undefined {
  if (typeof votes !== 'number' || votes <= 0) return undefined;
  const logMin = 3; // 1k votes
  const logMax = 6; // 1M votes
  const normalized = ((Math.log10(votes) - logMin) / (logMax - logMin)) * 100;
  const clamped = Math.max(0, Math.min(100, normalized));
  return Math.round(clamped * 10) / 10;
}

export function buildPopularitySignal(movie: RadarrMovie): PopularitySignal {
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

export function computePopularityTier(
  value: number | undefined,
  thresholds: BrokerConfig['thresholds']
): 'low' | 'mid' | 'high' | undefined {
  if (typeof value !== 'number' || !thresholds) return undefined;
  const low = thresholds.popularityLow as number;
  const high = thresholds.popularityHigh as number;
  if (value <= low) return 'low';
  if (value >= high) return 'high';
  return 'mid';
}
