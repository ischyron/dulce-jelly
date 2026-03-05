import { GripVertical } from 'lucide-react';
import type { ExtendedLlmRulesetSectionProps } from '../../types';

export function ExtendedLlmRuleset({
  form,
  set,
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
        <div
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: '#8b87aa' }}
        >
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(251,146,60,0.25)', color: '#ffedd5', border: '1px solid rgba(253,186,116,0.4)' }}
          >
            5
          </span>
          Final LLM ruleset
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          This is over and above deterministic CF scoring. It builds a final LLM ruleset prompt for dropping weak
          releases and tie-break scoring.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          New installs start with 2 disabled examples: exceptional-title Remux review and original-language tie-break
          preference.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Result intent: Scout output includes stronger finalists, while weaker candidates are expected to move to a
          dropped-releases section.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Drag and drop can be used to set rule priority (top runs first).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              className="text-sm font-medium mb-1 block"
              style={{ color: '#c4b5fd' }}
              htmlFor="scout-llm-tie-delta"
            >
              Tie-break delta
            </label>
            <input
              id="scout-llm-tie-delta"
              name="scoutPipelineLlmTieDelta"
              value={form.scoutPipelineLlmTieDelta ?? '10'}
              onChange={(e) => set('scoutPipelineLlmTieDelta', e.target.value)}
              className="w-full px-2 py-1 rounded text-xs"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>
          <div>
            <label
              className="text-sm font-medium mb-1 block"
              style={{ color: '#c4b5fd' }}
              htmlFor="scout-llm-weak-delta"
            >
              Weak drop delta
            </label>
            <input
              id="scout-llm-weak-delta"
              name="scoutPipelineLlmWeakDropDelta"
              value={form.scoutPipelineLlmWeakDropDelta ?? '40'}
              onChange={(e) => set('scoutPipelineLlmWeakDropDelta', e.target.value)}
              className="w-full px-2 py-1 rounded text-xs"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>
        </div>
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
              {(() => {
                const ruleId = `${rule.id ?? 'new'}-${idx}`;
                const nameId = `llm-rule-name-${ruleId}`;
                const enabledId = `llm-rule-enabled-${ruleId}`;
                const sentenceId = `llm-rule-sentence-${ruleId}`;
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-mono min-w-[5rem]"
                        style={{ color: '#c4b5fd', cursor: llmDragIndex === idx ? 'grabbing' : 'grab' }}
                        title="Drag to reorder"
                      >
                        <GripVertical size={14} />P{idx + 1}
                      </span>
                      <input
                        id={nameId}
                        name={nameId}
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
                      <label
                        htmlFor={enabledId}
                        className="inline-flex items-center gap-1 text-xs"
                        style={{ color: 'var(--c-muted)' }}
                      >
                        <input
                          id={enabledId}
                          name={enabledId}
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
                      id={sentenceId}
                      name={sentenceId}
                      rows={2}
                      value={rule.sentence}
                      onChange={(e) => updateLlmRule(idx, { sentence: e.target.value })}
                      placeholder="Natural rule sentence..."
                      className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                    />
                  </>
                );
              })()}
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
              Add Disabled Examples (2)
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
          id="llm-refine-objective"
          name="llmRefineObjective"
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
            id="llm-draft-output"
            name="llmDraftOutput"
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
