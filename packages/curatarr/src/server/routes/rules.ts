import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';

function validateRuleConfig(category: string, config: unknown): string | null {
  if (category === 'scout_custom_cf') {
    const c = (config ?? {}) as Record<string, unknown>;
    const matchType = c.matchType === 'regex' ? 'regex' : c.matchType === 'string' ? 'string' : '';
    const pattern = typeof c.pattern === 'string' ? c.pattern.trim() : '';
    const score = Number(c.score ?? NaN);
    if (!matchType) return 'scout_custom_cf requires matchType: regex|string';
    if (!pattern) return 'scout_custom_cf requires a non-empty pattern';
    if (!Number.isFinite(score)) return 'scout_custom_cf requires numeric score';
    if (matchType === 'regex') {
      const flagsRaw = typeof c.flags === 'string' ? c.flags : 'i';
      const flags = flagsRaw.replace(/[^gimsuy]/g, '');
      try {
        // Validate regex early so scout scoring never crashes at runtime.
        // eslint-disable-next-line no-new
        new RegExp(pattern, flags);
      } catch {
        return 'scout_custom_cf pattern is not a valid regex';
      }
    }
    return null;
  }
  if (category === 'scout_llm_ruleset') {
    const c = (config ?? {}) as Record<string, unknown>;
    const sentence = typeof c.sentence === 'string' ? c.sentence.trim() : '';
    if (!sentence) return 'scout_llm_ruleset requires sentence';
    return null;
  }
  return null;
}

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
    const body = (await c.req.json()) as { rules: unknown[] };
    if (!Array.isArray(body.rules)) {
      return c.json({ error: 'Expected { rules: [...] }' }, 400);
    }
    const ids: number[] = [];
    for (const rule of body.rules) {
      const r = rule as Record<string, unknown>;
      const category = r.category as string;
      const config = r.config as object;
      const configError = validateRuleConfig(category, config);
      if (configError) {
        return c.json({ error: configError }, 400);
      }
      const id = db.upsertRule({
        id: r.id as number | undefined,
        category,
        name: r.name as string,
        enabled: r.enabled !== false,
        priority: r.priority as number | undefined,
        config,
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
    const body = (await c.req.json()) as { category: string; ids: number[] };
    if (!body.category || !Array.isArray(body.ids)) {
      return c.json({ error: 'Expected { category, ids }' }, 400);
    }
    db.reorderRules(body.category, body.ids);
    return c.json({ reordered: true });
  });

  return app;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
