import type { CustomOverridesSectionProps } from '../../types';

export function CustomOverrides({
  form,
  set,
  customCfDraft,
  updateCustomCfRule,
  removeCustomCfRule,
  addCustomCfRule,
  saveCustomCf,
  savePending,
  customCfSaved,
  customCfError,
  customCfPreviewTitle,
  setCustomCfPreviewTitle,
  runCustomCfPreview,
  customCfPreviewPending,
  customCfPreviewData,
  blockerDraft,
  updateBlockerRule,
  removeBlockerRule,
  addBlockerRule,
  saveBlockers,
  blockersSavePending,
  blockersSaved,
  blockersError,
}: CustomOverridesSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: '#8b87aa' }}
        >
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(124,58,237,0.28)', color: '#ddd6fe', border: '1px solid rgba(196,181,253,0.4)' }}
          >
            4
          </span>
          Additional Custom Format Scores & Blocking Rules
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Add custom filename/title pattern rules (regex or string) with score deltas. These are applied after TRaSH
          baseline scoring.
        </p>
        <label
          htmlFor="scout-blockers-enabled"
          className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded border"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)', background: 'var(--c-surface)' }}
        >
          <input
            id="scout-blockers-enabled"
            type="checkbox"
            checked={(form.scoutPipelineBlockersEnabled ?? 'false') === 'true'}
            onChange={(e) => set('scoutPipelineBlockersEnabled', e.target.checked ? 'true' : 'false')}
          />
          Enable blocking rules (feature-flagged)
        </label>
        <div
          className="rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}
        >
          Example: To prefer the{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            FrameStore
          </span>{' '}
          release group, use{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            string
          </span>{' '}
          match with the pattern{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            framestor
          </span>
          , then set your preferred score delta.
        </div>
        <div className="space-y-2">
          {customCfDraft.map((row, idx) =>
            (() => {
              const rowId = `${row.id ?? 'new'}-${idx}`;
              const nameId = `custom-cf-name-${rowId}`;
              const matchTypeId = `custom-cf-match-type-${rowId}`;
              const patternId = `custom-cf-pattern-${rowId}`;
              const scoreId = `custom-cf-score-${rowId}`;
              const flagsId = `custom-cf-flags-${rowId}`;
              const enabledId = `custom-cf-enabled-${rowId}`;
              return (
                <div
                  key={`${row.id ?? 'new'}-${idx}`}
                  className="rounded border p-2 grid grid-cols-1 sm:grid-cols-12 gap-2"
                  style={{ borderColor: 'var(--c-border)' }}
                >
                  <div className="sm:col-span-2">
                    <input
                      id={nameId}
                      name={nameId}
                      value={row.name}
                      onChange={(e) => updateCustomCfRule(idx, { name: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                      placeholder="Rule name"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      id={matchTypeId}
                      name={matchTypeId}
                      value={row.matchType}
                      onChange={(e) => updateCustomCfRule(idx, { matchType: e.target.value as 'regex' | 'string' })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                    >
                      <option value="regex">Regex</option>
                      <option value="string">String</option>
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      id={patternId}
                      name={patternId}
                      value={row.pattern}
                      onChange={(e) => updateCustomCfRule(idx, { pattern: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs font-mono"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                      placeholder={row.matchType === 'regex' ? '\\bframestor\\b' : 'framestor'}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <input
                      id={scoreId}
                      name={scoreId}
                      value={row.score}
                      onChange={(e) => updateCustomCfRule(idx, { score: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                      placeholder="score"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <input
                      id={flagsId}
                      name={flagsId}
                      value={row.flags}
                      onChange={(e) => updateCustomCfRule(idx, { flags: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs"
                      style={{
                        background: 'var(--c-surface)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-text)',
                      }}
                      placeholder="i"
                      title="Regex flags"
                      disabled={row.matchType !== 'regex'}
                    />
                  </div>
                  <div className="sm:col-span-1 flex items-center justify-end gap-2">
                    <input
                      id={enabledId}
                      name={enabledId}
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateCustomCfRule(idx, { enabled: e.target.checked })}
                      title="Enabled"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomCfRule(idx)}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: 'var(--c-border)', color: '#fda4af' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })(),
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addCustomCfRule}
              disabled={customCfDraft.length >= 1}
              className="px-3 py-1.5 rounded border text-xs"
              style={{
                borderColor: 'var(--c-border)',
                color: customCfDraft.length >= 1 ? 'var(--c-muted)' : '#c4b5fd',
                opacity: customCfDraft.length >= 1 ? 0.65 : 1,
              }}
            >
              Add Rule
            </button>
            <button
              type="button"
              onClick={saveCustomCf}
              disabled={savePending}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              {savePending ? 'Saving…' : 'Save Custom CF Rules'}
            </button>
            {customCfSaved && <span className="text-xs text-green-400">Saved</span>}
            {customCfError && <span className="text-xs text-red-400">{customCfError}</span>}
          </div>
        </div>
        <div
          className="rounded border p-2 space-y-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Live Match Preview
          </div>
          <div className="flex items-center gap-2">
            <input
              id="custom-cf-preview-title"
              name="customCfPreviewTitle"
              value={customCfPreviewTitle}
              onChange={(e) => setCustomCfPreviewTitle(e.target.value)}
              placeholder="Release title to test..."
              className="w-full px-2 py-1 rounded text-xs"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <button
              type="button"
              onClick={runCustomCfPreview}
              disabled={customCfPreviewPending || !customCfPreviewTitle.trim()}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Preview
            </button>
          </div>
          {customCfPreviewData && (
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Delta:{' '}
              <span style={{ color: 'var(--c-text)' }}>
                {customCfPreviewData.delta >= 0 ? '+' : ''}
                {customCfPreviewData.delta}
              </span>{' '}
              · Matches: {customCfPreviewData.reasons.join(', ') || 'none'}
            </div>
          )}
        </div>
        <div
          className="rounded border p-2 space-y-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Release Blockers
          </div>
          {blockerDraft.map((row, idx) => {
            const rowId = `${row.id ?? 'new'}-${idx}`;
            return (
              <div
                key={`blocker-${rowId}`}
                className="rounded border p-2 grid grid-cols-1 sm:grid-cols-12 gap-2"
                style={{ borderColor: 'var(--c-border)' }}
              >
                <div className="sm:col-span-2">
                  <input
                    value={row.name}
                    onChange={(e) => updateBlockerRule(idx, { name: e.target.value })}
                    className="w-full px-2 py-1 rounded text-xs"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                    placeholder="Blocker name"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={row.matchType}
                    onChange={(e) => updateBlockerRule(idx, { matchType: e.target.value as 'regex' | 'string' })}
                    className="w-full px-2 py-1 rounded text-xs"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  >
                    <option value="regex">Regex</option>
                    <option value="string">String</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <input
                    value={row.pattern}
                    onChange={(e) => updateBlockerRule(idx, { pattern: e.target.value })}
                    className="w-full px-2 py-1 rounded text-xs font-mono"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                    placeholder={row.matchType === 'regex' ? '\\bcam\\b' : 'cam'}
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    value={row.reason}
                    onChange={(e) => updateBlockerRule(idx, { reason: e.target.value })}
                    className="w-full px-2 py-1 rounded text-xs"
                    style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                    placeholder="Reason shown in dropped list"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-end gap-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateBlockerRule(idx, { enabled: e.target.checked })}
                    title="Enabled"
                  />
                  <button
                    type="button"
                    onClick={() => removeBlockerRule(idx)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: 'var(--c-border)', color: '#fda4af' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addBlockerRule}
              className="px-3 py-1.5 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Add Blocker
            </button>
            <button
              type="button"
              onClick={saveBlockers}
              disabled={blockersSavePending}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              {blockersSavePending ? 'Saving…' : 'Save Blockers'}
            </button>
            {blockersSaved && <span className="text-xs text-green-400">Saved</span>}
            {blockersError && <span className="text-xs text-red-400">{blockersError}</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
