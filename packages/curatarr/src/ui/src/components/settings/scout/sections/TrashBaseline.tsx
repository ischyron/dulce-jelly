import type { TrashBaselineSectionProps } from '../../types';

function stateLabel(state?: string): string {
  if (state === 'in_sync') return 'Aligned';
  if (state === 'drifted') return 'Overridden';
  return 'Unknown';
}

export function TrashBaseline({ trashParityData, onRefreshBaseline }: TrashBaselineSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div
        className="rounded-lg border p-3 space-y-3 text-xs"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          TRaSH Baseline (Read-only)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshBaseline}
            className="px-3 py-1.5 rounded border text-xs"
            style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
          >
            Refresh Baseline Check
          </button>
          <span style={{ color: 'var(--c-muted)' }}>
            State:{' '}
            <span
              style={{
                color:
                  trashParityData?.state === 'drifted'
                    ? '#f59e0b'
                    : trashParityData?.state === 'in_sync'
                      ? '#4ade80'
                      : 'var(--c-text)',
              }}
            >
              {stateLabel(trashParityData?.state)}
            </span>
          </span>
        </div>
        <div style={{ color: 'var(--c-muted)' }}>
          Checked:{' '}
          <span style={{ color: 'var(--c-text)' }}>
            {trashParityData?.checkedAt ? new Date(trashParityData.checkedAt).toLocaleString() : 'n/a'}
          </span>{' '}
          · Baseline: <span style={{ color: 'var(--c-text)' }}>{trashParityData?.baselineCount ?? 0}</span> · Current:{' '}
          <span style={{ color: 'var(--c-text)' }}>{trashParityData?.currentCount ?? 0}</span>
        </div>
        {trashParityData?.reason && <div style={{ color: '#f59e0b' }}>Reason: {trashParityData.reason}</div>}
        {(trashParityData?.diff.added.length ?? 0) > 0 && (
          <div style={{ color: 'var(--c-muted)' }}>
            In baseline only: {trashParityData?.diff.added.map((x) => `${x.name} (${x.score})`).join(', ')}
          </div>
        )}
        {(trashParityData?.diff.removed.length ?? 0) > 0 && (
          <div style={{ color: 'var(--c-muted)' }}>
            In current only: {trashParityData?.diff.removed.map((x) => `${x.name} (${x.score})`).join(', ')}
          </div>
        )}
        {(trashParityData?.diff.changed.length ?? 0) > 0 && (
          <div style={{ color: 'var(--c-muted)' }}>
            Score differences:{' '}
            {trashParityData?.diff.changed.map((x) => `${x.name} (${x.before}→${x.after})`).join(', ')}
          </div>
        )}
      </div>
    </section>
  );
}
