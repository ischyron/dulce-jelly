import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';

export function makeCandidatesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/candidates?minCritic=60&minCommunity=6&maxResolution=1080p&limit=100
  app.get('/', (c) => {
    const minCritic = c.req.query('minCritic') ? parseFloat(c.req.query('minCritic')!) : undefined;
    const minCommunity = c.req.query('minCommunity') ? parseFloat(c.req.query('minCommunity')!) : undefined;
    const maxResolution = c.req.query('maxResolution') ?? '1080p';
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const releaseGroups = c.req.query('releaseGroups')?.split(',').filter(Boolean);

    const candidates = db.getUpgradeCandidates({
      maxResolution,
      minCriticRating: minCritic,
      minCommunityRating: minCommunity,
      releaseGroups,
      limit,
    });

    // Add a composite priority score
    const withScore = candidates.map(c => {
      const mc = c.critic_rating ?? 0;
      const imdb = c.community_rating ?? 0;
      const score = Math.round(mc * 0.4 + imdb * 6);
      return { ...c, priority_score: score };
    });

    withScore.sort((a, b) => b.priority_score - a.priority_score);

    return c.json({ total: withScore.length, candidates: withScore });
  });

  return app;
}
