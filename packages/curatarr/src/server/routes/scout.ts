import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { ProwlarrClient, type ProwlarrSearchResult } from '../../integrations/prowlarr/client.js';

interface ScoredRelease extends ProwlarrSearchResult {
  score: number;
  reasons: string[];
}

interface SearchSuccess {
  movieId: number;
  query: string;
  total: number;
  releases: ScoredRelease[];
}

function toText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function scoreRelease(r: ProwlarrSearchResult): ScoredRelease {
  const t = r.title.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (/\b2160p\b|\b4k\b/.test(t)) { score += 40; reasons.push('2160p'); }
  else if (/\b1080p\b/.test(t)) { score += 25; reasons.push('1080p'); }
  else if (/\b720p\b/.test(t)) { score += 10; reasons.push('720p'); }

  if (/\b(remux)\b/.test(t)) { score += 28; reasons.push('remux'); }
  else if (/\bbluray\b|\bbd\b/.test(t)) { score += 16; reasons.push('bluray'); }
  else if (/\bweb-?dl\b/.test(t)) { score += 12; reasons.push('web-dl'); }

  if (/\bhevc\b|\bx265\b/.test(t)) { score += 20; reasons.push('hevc'); }
  else if (/\bav1\b/.test(t)) { score += 16; reasons.push('av1'); }
  else if (/\bh264\b|\bx264\b/.test(t)) { score += 8; reasons.push('h264'); }

  if (/\bxvid\b|\bmpeg4\b/.test(t)) { score -= 30; reasons.push('legacy codec penalty'); }

  if (r.size && /\b2160p\b|\b4k\b/.test(t) && r.size < 8_000_000_000) {
    score -= 15;
    reasons.push('small-for-4k penalty');
  }

  if (r.seeders != null) {
    score += Math.min(12, Math.max(0, Math.floor(r.seeders / 20)));
  }

  return { ...r, score, reasons };
}

function resolveProwlarrConfig(db: CuratDb): { url: string; apiKey: string } | null {
  const url = db.getSetting('prowlarrUrl') ?? process.env.PROWLARR_URL ?? '';
  const apiKey = db.getSetting('prowlarrApiKey') ?? process.env.PROWLARR_API_KEY ?? '';
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

function configuredBatchCap(db: CuratDb): number {
  const raw = parseInt(db.getSetting('scoutSearchBatchSize') ?? '10', 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(10, raw));
}

async function searchOneMovie(db: CuratDb, client: ProwlarrClient, movieId: number, queryOverride?: string): Promise<SearchSuccess> {
  const movie = db.getMovieById(movieId);
  if (!movie) throw new Error('movie_not_found');
  const title = movie.jellyfin_title ?? movie.parsed_title ?? movie.folder_name;
  const year = movie.jellyfin_year ?? movie.parsed_year;
  const query = toText(queryOverride).trim() || [title, year].filter(Boolean).join(' ');

  const releases = await client.searchMovie(query);
  const scored = releases.map(scoreRelease).sort((a, b) => b.score - a.score);
  return { movieId, query, total: scored.length, releases: scored };
}

export function makeScoutRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // POST /api/scout/search-one  { movieId: number, query?: string }
  app.post('/search-one', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { movieId?: unknown; query?: unknown };
    const movieId = Number(body.movieId);
    if (!Number.isFinite(movieId) || movieId <= 0) {
      return c.json({ error: 'invalid_movie_id' }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) {
      return c.json({ error: 'prowlarr_not_configured' }, 422);
    }

    try {
      const client = new ProwlarrClient(cfg.url, cfg.apiKey);
      const result = await searchOneMovie(db, client, movieId, toText(body.query));
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
    const body = await c.req.json().catch(() => ({})) as { movieIds?: unknown; batchSize?: unknown };
    const movieIdsRaw = Array.isArray(body.movieIds) ? body.movieIds : [];
    const movieIds = Array.from(new Set(
      movieIdsRaw.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0)
    ));
    if (movieIds.length === 0) return c.json({ error: 'movie_ids_required' }, 400);
    if (movieIds.length > 10) return c.json({ error: 'batch_limit_exceeded', max: 10 }, 400);

    const cap = configuredBatchCap(db);
    if (movieIds.length > cap) {
      return c.json({ error: 'batch_limit_exceeded', max: cap }, 400);
    }

    const cfg = resolveProwlarrConfig(db);
    if (!cfg) return c.json({ error: 'prowlarr_not_configured' }, 422);

    const client = new ProwlarrClient(cfg.url, cfg.apiKey);
    const results: Array<{ movieId: number; query?: string; total?: number; releases?: ScoredRelease[]; error?: string }> = [];
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

  return app;
}
