import { GripVertical } from 'lucide-react';
import type { ExtendedLlmRulesetSectionProps } from '../../types';

export function ExtendedLlmRuleset({
  llmRulesDraft,
  llmDragIndex,
  onLlmDragStart,
  onLlmDragOver,
  onLlmDrop,
  onLlmDragEnd,
  updateLlmRule,
  removeLlmRule,
  addLlmRule,
  addLlmSampleRules,
  saveLlmRules,
  savePending,
  llmRulesSaved,
  llmRulesError,
  refineObjective,
  setRefineObjective,
  generateDraft,
  draftPending,
  draftData,
}: ExtendedLlmRulesetSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div
        className="rounded-lg border p-3 space-y-2"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Extended release filter LLM ruleset
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          This is over and above deterministic CF scoring. It builds a final LLM ruleset prompt for dropping weak
          releases and tie-break scoring.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Result intent: Scout output includes stronger finalists, while weaker candidates are expected to move to a
          dropped-releases section.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Drag and drop can be used to set rule priority (top runs first).
        </p>
        <div className="space-y-2">
          {llmRulesDraft.map((rule, idx) => (
            <div
              key={`${rule.id ?? 'new'}-${idx}`}
              className="rounded border p-2 space-y-2"
              style={{
                borderColor: llmDragIndex === idx ? '#7c3aed' : 'var(--c-border)',
                background: llmDragIndex === idx ? 'rgba(124,58,237,0.08)' : 'transparent',
                cursor: llmDragIndex === idx ? 'grabbing' : 'grab',
              }}
              draggable
              onDragStart={() => onLlmDragStart(idx)}
              onDragOver={onLlmDragOver}
              onDrop={() => onLlmDrop(idx)}
              onDragEnd={onLlmDragEnd}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-mono min-w-[5rem]"
                  style={{ color: '#c4b5fd', cursor: llmDragIndex === idx ? 'grabbing' : 'grab' }}
                  title="Drag to reorder"
                >
                  <GripVertical size={14} />P{idx + 1}
                </span>
                <input
                  value={rule.name}
                  onChange={(e) => updateLlmRule(idx, { name: e.target.value })}
                  className="w-52 px-2 py-1 rounded text-xs"
                  style={{
                    background: 'var(--c-surface)',
                    border: '1px solid var(--c-border)',
                    color: 'var(--c-text)',
                  }}
                  placeholder="Rule label"
                />
                <label className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--c-muted)' }}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => updateLlmRule(idx, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <button
                  type="button"
                  onClick={() => removeLlmRule(idx)}
                  className="px-2 py-1 rounded border text-xs"
                  style={{ borderColor: 'var(--c-border)', color: '#fda4af' }}
                >
                  Remove
                </button>
              </div>
              <textarea
                rows={2}
                value={rule.sentence}
                onChange={(e) => updateLlmRule(idx, { sentence: e.target.value })}
                placeholder="Natural rule sentence..."
                className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addLlmRule}
              className="px-3 py-1.5 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Add Rule
            </button>
            <button
              type="button"
              onClick={addLlmSampleRules}
              className="px-3 py-1.5 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Add Disabled Examples
            </button>
            <button
              type="button"
              onClick={saveLlmRules}
              disabled={savePending}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              {savePending ? 'Saving…' : 'Save LLM Ruleset'}
            </button>
            {llmRulesSaved && <span className="text-xs text-green-400">Saved</span>}
            {llmRulesError && <span className="text-xs text-red-400">{llmRulesError}</span>}
          </div>
        </div>
        <textarea
          rows={2}
          value={refineObjective}
          onChange={(e) => setRefineObjective(e.target.value)}
          placeholder="Optional objective to generate a draft prompt"
          className="w-full px-3 py-2 rounded text-sm focus:outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateDraft}
            disabled={draftPending}
            className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
            style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
          >
            {draftPending ? 'Generating…' : 'Generate Ruleset Draft'}
          </button>
        </div>
        {draftData && (
          <textarea
            rows={8}
            readOnly
            value={draftData.prompt}
            className="w-full px-3 py-2 rounded text-xs font-mono"
            style={{ background: 'rgba(30,30,46,0.7)', border: '1px solid var(--c-border)', color: '#d4cfff' }}
          />
        )}
      </div>
    </section>
  );
}
