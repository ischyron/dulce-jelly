import { Hono } from 'hono';
import type { CuratDb } from '../../db/client.js';
import { SCOUT_RULE_CATEGORIES } from './scout/rulesDomain.js';

function validateRuleConfig(category: string, config: unknown): string | null {
  if (SCOUT_RULE_CATEGORIES.includes(category as (typeof SCOUT_RULE_CATEGORIES)[number])) {
    return 'Scout categories are managed via /api/scout/rules endpoints';
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
      if (SCOUT_RULE_CATEGORIES.includes(category as (typeof SCOUT_RULE_CATEGORIES)[number])) {
        return c.json({ error: 'Scout categories are managed via /api/scout/rules endpoints' }, 400);
      }
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
    const id = Number.parseInt(c.req.param('id'), 10);
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

  // PUT /api/rules/replace-category — replace entire category atomically from caller perspective
  app.put('/replace-category', async (c) => {
    const body = (await c.req.json()) as { category?: unknown; rules?: unknown[] };
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const incoming = Array.isArray(body.rules) ? body.rules : null;
    if (!category || incoming == null) {
      return c.json({ error: 'Expected { category, rules: [...] }' }, 400);
    }
    if (SCOUT_RULE_CATEGORIES.includes(category as (typeof SCOUT_RULE_CATEGORIES)[number])) {
      return c.json({ error: 'Scout categories are managed via /api/scout/rules endpoints' }, 400);
    }

    const normalized: Array<{ name: string; enabled: boolean; priority: number; config: Record<string, unknown> }> = [];
    for (const [idx, rule] of incoming.entries()) {
      const r = (rule ?? {}) as Record<string, unknown>;
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `${category} ${idx + 1}`;
      const config = (r.config ?? {}) as Record<string, unknown>;
      const priorityRaw = Number(r.priority ?? idx + 1);
      const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.floor(priorityRaw)) : idx + 1;
      const enabled = r.enabled !== false && r.enabled !== 0;
      const configError = validateRuleConfig(category, config);
      if (configError) return c.json({ error: configError }, 400);
      normalized.push({ name, enabled, priority, config });
    }

    db.deleteRulesByCategory(category);
    const ids: number[] = [];
    for (const row of normalized) {
      ids.push(
        db.upsertRule({
          category,
          name: row.name,
          enabled: row.enabled,
          priority: row.priority,
          config: row.config,
        }),
      );
    }
    return c.json({ saved: ids });
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
