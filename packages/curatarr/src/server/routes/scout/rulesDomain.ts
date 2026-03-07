import type { CuratDb } from '../../../db/client.js';

export const SCOUT_RULE_CATEGORIES = ['scout_custom_cf', 'scout_release_blockers', 'scout_llm_ruleset'] as const;
export type ScoutRuleCategory = (typeof SCOUT_RULE_CATEGORIES)[number];

function isScoutRuleCategory(value: unknown): value is ScoutRuleCategory {
  return typeof value === 'string' && SCOUT_RULE_CATEGORIES.includes(value as ScoutRuleCategory);
}

export function validateScoutRuleConfig(category: ScoutRuleCategory, config: unknown): string | null {
  if (category === 'scout_custom_cf') {
    const c = (config ?? {}) as Record<string, unknown>;
    const matchType = c.matchType === 'regex' ? 'regex' : c.matchType === 'string' ? 'string' : '';
    const pattern = typeof c.pattern === 'string' ? c.pattern.trim() : '';
    const score = Number(c.score ?? Number.NaN);
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
  if (category === 'scout_release_blockers') {
    const c = (config ?? {}) as Record<string, unknown>;
    const matchType = c.matchType === 'regex' ? 'regex' : c.matchType === 'string' ? 'string' : '';
    const pattern = typeof c.pattern === 'string' ? c.pattern.trim() : '';
    if (!matchType) return 'scout_release_blockers requires matchType: regex|string';
    if (!pattern) return 'scout_release_blockers requires a non-empty pattern';
    if (matchType === 'regex') {
      const flagsRaw = typeof c.flags === 'string' ? c.flags : 'i';
      const flags = flagsRaw.includes('i') ? 'i' : '';
      try {
        new RegExp(pattern, flags);
      } catch {
        return 'scout_release_blockers pattern is not a valid regex';
      }
    }
    return null;
  }
  const c = (config ?? {}) as Record<string, unknown>;
  const sentence = typeof c.sentence === 'string' ? c.sentence.trim() : '';
  if (!sentence) return 'scout_llm_ruleset requires sentence';
  return null;
}

export function listScoutRules(db: CuratDb): Record<string, unknown[]> {
  const rows = db.getRules().filter((r) => isScoutRuleCategory(r.category));
  const grouped: Record<string, unknown[]> = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({
      ...row,
      config: safeParseJson(row.config),
    });
  }
  return grouped;
}

export function replaceScoutRuleCategory(
  db: CuratDb,
  inputCategory: unknown,
  incoming: unknown,
): { error?: string; status?: number; saved?: number[] } {
  if (!isScoutRuleCategory(inputCategory)) {
    return { error: 'Expected scout rule category', status: 400 };
  }
  if (!Array.isArray(incoming)) {
    return { error: 'Expected { category, rules: [...] }', status: 400 };
  }
  if (inputCategory === 'scout_custom_cf' && incoming.length > 1) {
    return { error: 'scout_custom_cf supports exactly one override rule', status: 400 };
  }
  const normalized: Array<{ name: string; enabled: boolean; priority: number; config: Record<string, unknown> }> = [];
  for (const [idx, rule] of incoming.entries()) {
    const r = (rule ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `${inputCategory} ${idx + 1}`;
    const config = (r.config ?? {}) as Record<string, unknown>;
    const priorityRaw = Number(r.priority ?? idx + 1);
    const priority = Number.isFinite(priorityRaw) ? Math.max(0, Math.floor(priorityRaw)) : idx + 1;
    const enabled = r.enabled !== false && r.enabled !== 0;
    const configError = validateScoutRuleConfig(inputCategory, config);
    if (configError) return { error: configError, status: 400 };
    normalized.push({ name, enabled, priority, config });
  }
  db.deleteRulesByCategory(inputCategory);
  const ids: number[] = [];
  for (const row of normalized) {
    ids.push(
      db.upsertRule({
        category: inputCategory,
        name: row.name,
        enabled: row.enabled,
        priority: row.priority,
        config: row.config,
      }),
    );
  }
  return { saved: ids };
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
