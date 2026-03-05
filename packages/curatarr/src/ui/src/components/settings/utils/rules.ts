import type { ScoutCustomCfDraft, ScoutLlmRuleDraft } from '../types';

export function extractRuleDescription(configText: string): string {
  try {
    const obj = JSON.parse(configText) as Record<string, unknown>;
    const val = obj.description ?? obj.reason ?? '';
    return typeof val === 'string' ? val : '';
  } catch {
    return '';
  }
}

export function patchRuleDescription(configText: string, description: string): string {
  try {
    const obj = JSON.parse(configText) as Record<string, unknown>;
    obj.description = description;
    return JSON.stringify(obj, null, 2);
  } catch {
    return JSON.stringify({ description }, null, 2);
  }
}

export function parseCustomCfRule(rule: {
  id: number;
  name: string;
  enabled: number;
  priority: number;
  config: unknown;
}): ScoutCustomCfDraft {
  const cfg = (rule.config ?? {}) as Record<string, unknown>;
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled !== 0,
    priority: rule.priority,
    matchType: cfg.matchType === 'regex' ? 'regex' : 'string',
    pattern: typeof cfg.pattern === 'string' ? cfg.pattern : '',
    score: String(cfg.score ?? '0'),
    flags: typeof cfg.flags === 'string' ? cfg.flags : 'i',
    appliesTo: cfg.appliesTo === 'full' ? 'full' : 'title',
  };
}

export function parseLlmRule(rule: {
  id: number;
  name: string;
  enabled: number;
  priority: number;
  config: unknown;
}): ScoutLlmRuleDraft {
  const cfg = (rule.config ?? {}) as Record<string, unknown>;
  const sentence =
    typeof cfg.sentence === 'string' ? cfg.sentence : typeof cfg.description === 'string' ? cfg.description : rule.name;
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled !== 0,
    priority: rule.priority,
    sentence,
  };
}
