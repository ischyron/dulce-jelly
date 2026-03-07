import { Field } from '../../shared/Field';
import type { AutomationSectionProps } from '../../types';

export function Automation({ form, set, autoStatusData, runAutoScout, runPending }: AutomationSectionProps) {
  const enabled = (form.scoutPipelineAutoEnabled ?? 'false') === 'true';
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.55), rgba(56,189,248,0.35))',
            color: '#fff',
            border: '1px solid rgba(224,231,255,0.7)',
          }}
        >
          6
        </span>
        Manual/Auto Decision
      </h2>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Enable automation to run Scout on a schedule. Manual run is always available.
      </p>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <span className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>
            Enable Scout Automation
          </span>
          <label
            htmlFor="scout-auto-enabled"
            className="w-full px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            <input
              id="scout-auto-enabled"
              name="scoutPipelineAutoEnabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => set('scoutPipelineAutoEnabled', e.target.checked ? 'true' : 'false')}
            />
            <span>Enable Scout automation</span>
          </label>
        </div>
        {enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Frequency Interval (min)"
              name="scoutPipelineAutoIntervalMin"
              value={form.scoutPipelineAutoIntervalMin ?? '60'}
              onChange={(v) => set('scoutPipelineAutoIntervalMin', v)}
              placeholder="60"
              hint="Minimum enforced at 5 min."
            />
            <Field
              label="Cooldown (min)"
              name="scoutPipelineAutoCooldownMin"
              value={form.scoutPipelineAutoCooldownMin ?? '240'}
              onChange={(v) => set('scoutPipelineAutoCooldownMin', v)}
              placeholder="240"
              hint="Skip titles recently auto-scouted."
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--c-muted)' }}>
        <span>
          Auto status: {autoStatusData?.running ? 'running' : 'idle'}
          {autoStatusData?.lastRun ? ` · last run ${autoStatusData.lastRun.finishedAt}` : ''}
        </span>
        <button
          type="button"
          onClick={runAutoScout}
          disabled={runPending}
          className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
          style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
        >
          {runPending ? 'Running…' : 'Run Auto Scout Now'}
        </button>
      </div>
    </section>
  );
}
