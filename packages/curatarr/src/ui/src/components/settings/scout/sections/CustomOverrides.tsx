import type { CustomOverridesSectionProps } from '../../types';

export function CustomOverrides({
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
}: CustomOverridesSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Custom Format Scores (Overrides)
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Add your own filename/title pattern rules (regex or string) and score deltas. These apply after TRaSH baseline
          scoring.
        </p>
        <div
          className="rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}
        >
          Sample: Looking for{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            FrameStore
          </span>{' '}
          release group. Use{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            string
          </span>{' '}
          match with pattern{' '}
          <span className="font-mono" style={{ color: 'var(--c-text)' }}>
            framestor
          </span>
          , then set your preferred score.
        </div>
        <div className="space-y-2">
          {customCfDraft.map((row, idx) => (
            <div
              key={`${row.id ?? 'new'}-${idx}`}
              className="rounded border p-2 grid grid-cols-1 sm:grid-cols-12 gap-2"
              style={{ borderColor: 'var(--c-border)' }}
            >
              <div className="sm:col-span-2">
                <input
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
          ))}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addCustomCfRule}
              className="px-3 py-1.5 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
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
      </div>
    </section>
  );
}
