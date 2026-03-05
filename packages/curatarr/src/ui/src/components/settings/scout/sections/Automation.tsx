import { Field } from '../../shared/Field';
import type { AutomationSectionProps } from '../../types';

export function Automation({ form, set, autoStatusData, runAutoScout, runPending }: AutomationSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold" style={{ color: '#d4cfff' }}>
        Scout Automation
      </h2>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Automatic Scout runs process at most your Scout Batch Size (hard max 10) per run.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>
            Enabled
          </label>
          <label
            className="w-full px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            <input
              type="checkbox"
              checked={(form.scoutAutoEnabled ?? 'false') === 'true'}
              onChange={(e) => set('scoutAutoEnabled', e.target.checked ? 'true' : 'false')}
            />
            <span>Auto Scout enabled</span>
          </label>
        </div>
        <Field
          label="Interval (min)"
          name="scoutAutoIntervalMin"
          value={form.scoutAutoIntervalMin ?? '60'}
          onChange={(v) => set('scoutAutoIntervalMin', v)}
          placeholder="60"
          hint="Minimum enforced at 5 min."
        />
        <Field
          label="Cooldown (min)"
          name="scoutAutoCooldownMin"
          value={form.scoutAutoCooldownMin ?? '240'}
          onChange={(v) => set('scoutAutoCooldownMin', v)}
          placeholder="240"
          hint="Skip titles recently auto-scouted."
        />
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
