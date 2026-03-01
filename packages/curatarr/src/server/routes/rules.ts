import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';

export function makeRulesRoutes(db: CuratDb): Hono {
  const app = new Hono();

  // GET /api/rules?category=groups
  app.get('/', (c) => {
    const category = c.req.query('category');
    const rules = db.getRules(category);
    // Group by category for convenience
    const grouped: Record<string, unknown[]> = {};
    for (const r of rules) {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push({ ...r, config: safeParseJson(r.config) });
    }
    return c.json({ rules: grouped });
  });

  // PUT /api/rules — upsert one or more rules
  app.put('/', async (c) => {
    const body = await c.req.json() as { rules: unknown[] };
    if (!Array.isArray(body.rules)) {
      return c.json({ error: 'Expected { rules: [...] }' }, 400);
    }
    const ids: number[] = [];
    for (const rule of body.rules) {
      const r = rule as Record<string, unknown>;
      const id = db.upsertRule({
        id: r.id as number | undefined,
        category: r.category as string,
        name: r.name as string,
        enabled: r.enabled !== false,
        priority: r.priority as number | undefined,
        config: r.config as object,
      });
      ids.push(id);
    }
    return c.json({ saved: ids });
  });

  // DELETE /api/rules/:id
  app.delete('/:id', (c) => {
    const id = parseInt(c.req.param('id'), 10);
    const deleted = db.deleteRule(id);
    return deleted ? c.json({ deleted: true }) : c.json({ error: 'not found' }, 404);
  });

  // POST /api/rules/reorder  { category: string, ids: number[] }
  app.post('/reorder', async (c) => {
    const body = await c.req.json() as { category: string; ids: number[] };
    if (!body.category || !Array.isArray(body.ids)) {
      return c.json({ error: 'Expected { category, ids }' }, 400);
    }
    db.reorderRules(body.category, body.ids);
    return c.json({ reordered: true });
  });

  return app;
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
