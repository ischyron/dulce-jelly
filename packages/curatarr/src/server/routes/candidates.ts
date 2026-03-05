import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';

const LEGACY_CODECS = new Set(['mpeg4', 'mpeg2video', 'msmpeg4v3', 'xvid']);

export function makeCandidatesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/candidates?minCritic=60&minCommunity=6&maxResolution=1080p&limit=100
  app.get('/', (c) => {
    const minCriticRaw = c.req.query('minCritic');
    const minCommunityRaw = c.req.query('minCommunity');
    const minCritic = minCriticRaw ? Number.parseFloat(minCriticRaw) : undefined;
    const minCommunity = minCommunityRaw ? Number.parseFloat(minCommunityRaw) : undefined;
    const maxResolution = c.req.query('maxResolution') ?? undefined;
    const limit = Number.parseInt(c.req.query('limit') ?? '100', 10);
    const releaseGroups = c.req.query('releaseGroups')?.split(',').filter(Boolean);
    const genre = c.req.query('genre') ?? undefined;
    const genres = (genre ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    const candidates = db.getUpgradeCandidates({
      maxResolution,
      minCriticRating: minCritic,
      minCommunityRating: minCommunity,
      releaseGroups,
      genres: genres.length > 0 ? genres : undefined,
      limit,
    });

    // Add a composite priority score
    const withScore = candidates.map((c) => {
      const mc = c.critic_rating ?? 0;
      const imdb = c.community_rating ?? 0;
      const base = Math.round(mc * 0.4 + imdb * 6);
      const codec = (c.video_codec ?? '').toLowerCase();
      const legacyBoost = LEGACY_CODECS.has(codec) ? 8 : 0;
      const score = base + legacyBoost;
      return {
        ...c,
        priority_score: score,
        priority_reasons: legacyBoost > 0 ? ['legacy_codec_surface'] : [],
      };
    });

    withScore.sort((a, b) => b.priority_score - a.priority_score);

    return c.json({ total: withScore.length, candidates: withScore });
  });

  return app;
}
