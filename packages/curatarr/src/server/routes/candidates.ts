import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { extractReleaseGroup } from '../../scanner/ffprobe.js';

const LEGACY_CODECS = new Set(['mpeg4', 'mpeg2video', 'msmpeg4v3', 'xvid']);

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return t ? t : null;
}

export function makeCandidatesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/candidates?criticScoreMin=60&imdbScoreMin=6&resolution=1080p&limit=100
  app.get('/', (c) => {
    const minCriticRaw = c.req.query('criticScoreMin') ?? c.req.query('minCritic');
    const minCommunityRaw = c.req.query('imdbScoreMin') ?? c.req.query('minCommunity');
    const minCritic = minCriticRaw ? Number.parseFloat(minCriticRaw) : undefined;
    const minCommunity = minCommunityRaw ? Number.parseFloat(minCommunityRaw) : undefined;
    const search = c.req.query('search') ?? c.req.query('q') ?? undefined;
    const resolution = c.req.query('resolution') ?? c.req.query('maxResolution') ?? undefined;
    const codec = c.req.query('codec') ?? undefined;
    const audioFormat = (c.req.query('audioFormat') ?? '').toLowerCase().trim() || undefined;
    const audioLayout = (c.req.query('audioLayout') ?? '').toLowerCase().trim() || undefined;
    const hdrOnly = c.req.query('hdr') === 'true';
    const dvOnly = c.req.query('dv') === 'true';
    const legacyOnly = c.req.query('legacy') === 'true';
    const noJf = c.req.query('noJf') === 'true';
    const multiOnly = c.req.query('multi') === 'true';
    const limitRaw = c.req.query('limit');
    const all = c.req.query('all') === '1' || (limitRaw ?? '').toLowerCase() === 'all';
    const parsedLimit = Number.parseInt(limitRaw ?? '100', 10);
    const limit = all || !Number.isFinite(parsedLimit) ? null : Math.max(1, Math.min(1000, parsedLimit));
    const releaseGroups = c.req.query('releaseGroups')?.split(',').filter(Boolean);
    const genre = c.req.query('genre') ?? undefined;
    const genreAnd = c.req.query('genreAnd') === '1' || c.req.query('genreAnd') === 'true';
    const genres = (genre ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const tags = (c.req.query('tags') ?? '')
      .split(',')
      .map((v) => normalizeTag(v))
      .filter((v): v is string => !!v);

    const candidates = db.getUpgradeCandidates({
      search,
      resolution,
      codec,
      audioFormat,
      audioLayout,
      hdrOnly,
      dvOnly,
      legacyOnly,
      noJf,
      multiOnly,
      minCriticRating: minCritic,
      minCommunityRating: minCommunity,
      releaseGroups,
      genres: genres.length > 0 ? genres : undefined,
      genreAnd,
      tags: tags.length > 0 ? tags : undefined,
    });

    // Add a composite priority score
    const withScore = candidates.map((row) => {
      const currentGroup = typeof row.release_group === 'string' ? row.release_group.trim() : '';
      if (!currentGroup && row.filename) {
        row.release_group = extractReleaseGroup(row.filename) ?? null;
      }
      const mc = row.critic_rating ?? 0;
      const imdb = row.community_rating ?? 0;
      const base = Math.round(mc * 0.4 + imdb * 6);
      const rowCodec = (row.video_codec ?? '').toLowerCase();
      const legacyBoost = LEGACY_CODECS.has(rowCodec) ? 8 : 0;
      const score = base + legacyBoost;
      return {
        ...row,
        priority_score: score,
        priority_reasons: legacyBoost > 0 ? ['legacy_codec_surface'] : [],
      };
    });

    withScore.sort((a, b) => b.priority_score - a.priority_score);
    const total = withScore.length;
    const limited = limit == null ? withScore : withScore.slice(0, limit);

    return c.json({ total, candidates: limited });
  });

  return app;
}
