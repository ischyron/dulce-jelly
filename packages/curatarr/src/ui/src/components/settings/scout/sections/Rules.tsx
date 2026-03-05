import type { RulesSectionProps } from '../../types';
import { extractRuleDescription, patchRuleDescription } from '../../utils/rules';

export function Rules({
  scoutRulesDraft,
  updateScoutRule,
  saveScoutRules,
  savePending,
  scoutRulesSaved,
  scoutRulesError,
}: RulesSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Scout Rules
        </div>
        {scoutRulesDraft.length === 0 && (
          <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
            No Scout rules found.
          </div>
        )}
        <div className="space-y-3">
          {scoutRulesDraft.map((rule) => (
            <div key={rule.id} className="rounded border p-3 space-y-2" style={{ borderColor: 'var(--c-border)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  {rule.name}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => updateScoutRule(rule.id, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>
                  Priority
                </label>
                <input
                  type="number"
                  value={String(rule.priority)}
                  onChange={(e) => updateScoutRule(rule.id, { priority: Number(e.target.value || 0) })}
                  className="w-32 px-2 py-1 rounded text-xs focus:outline-none"
                  style={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text)',
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>
                  Rule Intent (Natural Text)
                </label>
                <input
                  type="text"
                  value={extractRuleDescription(rule.configText)}
                  onChange={(e) =>
                    updateScoutRule(rule.id, { configText: patchRuleDescription(rule.configText, e.target.value) })
                  }
                  className="w-full px-2 py-1 rounded text-xs focus:outline-none"
                  style={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text)',
                  }}
                  placeholder="Example: prefer WEB-DL over WEBRip at same resolution"
                />
              </div>
              <details>
                <summary className="cursor-pointer text-xs" style={{ color: 'var(--c-muted)' }}>
                  Advanced JSON
                </summary>
                <textarea
                  rows={5}
                  value={rule.configText}
                  onChange={(e) => updateScoutRule(rule.id, { configText: e.target.value })}
                  className="w-full mt-2 px-2 py-1 rounded text-xs font-mono focus:outline-none"
                  style={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text)',
                  }}
                />
              </details>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>
                  Rule Name
                </label>
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => updateScoutRule(rule.id, { name: e.target.value })}
                  className="w-full px-2 py-1 rounded text-xs focus:outline-none"
                  style={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveScoutRules}
            disabled={savePending || scoutRulesDraft.length === 0}
            className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
            style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
          >
            {savePending ? 'Saving Rules…' : 'Save Scout Rules'}
          </button>
          {scoutRulesSaved && <span className="text-xs text-green-400">Saved</span>}
          {scoutRulesError && <span className="text-xs text-red-400">{scoutRulesError}</span>}
        </div>
      </div>
    </section>
  );
}
