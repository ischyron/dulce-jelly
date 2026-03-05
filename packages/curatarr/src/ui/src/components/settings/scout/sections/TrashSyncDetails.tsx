import type { TrashSyncDetailsSectionProps } from '../../types';
import { formatBytes, toPrettyJson } from '../../utils/format';

export function TrashSyncDetails({
  onSyncTrash,
  syncingTrash,
  syncTrashError,
  hasTrashSyncDetails,
  syncedTrashSource,
  syncedTrashRevision,
  syncedTrashModelVersion,
  syncedTrashMappingRevision,
  syncedTrashAt,
  syncedTrashRules,
  syncedTrashAppliedCount,
  syncedTrashWarning,
  appliedMappings,
  appliedChanges,
  appliedRules,
  upstreamSnapshot,
}: TrashSyncDetailsSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onSyncTrash}
          disabled={syncingTrash}
          className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
          style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
          title="Apply Curatarr TRaSH-aligned baseline scoring and refresh Scout rules"
        >
          {syncingTrash ? 'Syncing…' : 'Sync TRaSH Scores'}
        </button>
        <a
          href="https://trash-guides.info/"
          target="_blank"
          rel="noreferrer"
          className="text-xs underline"
          style={{ color: '#c4b5fd' }}
          title="Official TRaSH-Guides"
        >
          Official TRaSH-Guides
        </a>
        {syncTrashError && <span className="text-xs text-red-400">{syncTrashError}</span>}
      </div>

      <div
        className="rounded-lg border p-3 space-y-3 text-xs"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          TRaSH Sync Details (Read-only)
        </div>
        {!hasTrashSyncDetails && <div style={{ color: 'var(--c-muted)' }}>No TRaSH sync recorded yet.</div>}
        {hasTrashSyncDetails && (
          <>
            <div
              className="rounded border p-2 space-y-1"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="font-semibold" style={{ color: '#d4cfff' }}>
                Sync Meta
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Source: <span style={{ color: 'var(--c-text)' }}>{syncedTrashSource || 'n/a'}</span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Revision: <span style={{ color: 'var(--c-text)' }}>{syncedTrashRevision || 'n/a'}</span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Sync model: <span style={{ color: 'var(--c-text)' }}>{syncedTrashModelVersion || 'n/a'}</span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Mapping revision: <span style={{ color: 'var(--c-text)' }}>{syncedTrashMappingRevision || 'n/a'}</span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Last synced:{' '}
                <span style={{ color: 'var(--c-text)' }}>
                  {syncedTrashAt ? new Date(syncedTrashAt).toLocaleString() : 'n/a'}
                </span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Rules synced: <span style={{ color: 'var(--c-text)' }}>{syncedTrashRules || 'n/a'}</span>
              </div>
              <div style={{ color: 'var(--c-muted)' }}>
                Settings changed: <span style={{ color: 'var(--c-text)' }}>{syncedTrashAppliedCount || '0'}</span>
              </div>
              {syncedTrashWarning && <div style={{ color: '#f59e0b' }}>Note: {syncedTrashWarning}</div>}
            </div>

            <div
              className="rounded border p-2 space-y-2"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="font-semibold" style={{ color: '#d4cfff' }}>
                Declarative Mapping Set
              </div>
              {appliedMappings.length === 0 && (
                <div style={{ color: 'var(--c-muted)' }}>No mapping snapshot available.</div>
              )}
              {appliedMappings.length > 0 && (
                <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                  <table className="w-full text-[11px]">
                    <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                      <tr>
                        <th className="px-2 py-1 text-left">Setting</th>
                        <th className="px-2 py-1 text-left">TRaSH label</th>
                        <th className="px-2 py-1 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appliedMappings.map((row) => (
                        <tr key={`${row.key}-${row.trashLabel}`} style={{ borderTop: '1px solid var(--c-border)' }}>
                          <td className="px-2 py-1 font-mono" style={{ color: 'var(--c-text)' }}>
                            {row.key}
                          </td>
                          <td className="px-2 py-1" style={{ color: 'var(--c-muted)' }}>
                            {row.trashLabel}
                          </td>
                          <td className="px-2 py-1 text-right" style={{ color: '#c4b5fd' }}>
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {appliedChanges.length > 0 && (
                <div className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                  Changed keys: {appliedChanges.map((c) => c.key).join(', ')}
                </div>
              )}
            </div>

            <div
              className="rounded border p-2 space-y-2"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="font-semibold" style={{ color: '#d4cfff' }}>
                Imported Into Curatarr (Rules)
              </div>
              <div className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                Scout rules applied by the most recent TRaSH sync.
              </div>
              {appliedRules.length === 0 && (
                <div style={{ color: 'var(--c-muted)' }}>No applied snapshot available yet.</div>
              )}
              {appliedRules.length > 0 && (
                <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                  <table className="w-full text-[11px]">
                    <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                      <tr>
                        <th className="px-2 py-1 text-left">Rule</th>
                        <th className="px-2 py-1 text-right">Priority</th>
                        <th className="px-2 py-1 text-center">Enabled</th>
                        <th className="px-2 py-1 text-left">JSON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appliedRules.map((rule) => (
                        <tr key={rule.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                          <td className="px-2 py-1" style={{ color: 'var(--c-text)' }}>
                            {rule.name}
                          </td>
                          <td className="px-2 py-1 text-right" style={{ color: '#c4b5fd' }}>
                            {rule.priority}
                          </td>
                          <td className="px-2 py-1 text-center" style={{ color: rule.enabled ? '#4ade80' : '#f87171' }}>
                            {rule.enabled ? 'Yes' : 'No'}
                          </td>
                          <td className="px-2 py-1">
                            <details>
                              <summary className="cursor-pointer" style={{ color: '#c4b5fd' }}>
                                View JSON
                              </summary>
                              <pre
                                className="mt-1 p-2 rounded overflow-auto"
                                style={{ background: 'var(--c-bg)', color: '#d4cfff' }}
                              >
                                {toPrettyJson(rule.config)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="rounded border p-2 space-y-2"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
              <div className="font-semibold" style={{ color: '#d4cfff' }}>
                TRaSH Guide Snapshot
              </div>
              {!upstreamSnapshot && (
                <div style={{ color: '#f59e0b' }}>TRaSH guide snapshot unavailable from upstream.</div>
              )}
              {upstreamSnapshot && (
                <>
                  <div style={{ color: 'var(--c-muted)' }}>
                    Path:{' '}
                    <span className="font-mono" style={{ color: 'var(--c-text)' }}>
                      {upstreamSnapshot.path}
                    </span>{' '}
                    · Files: <span style={{ color: 'var(--c-text)' }}>{upstreamSnapshot.fileCount}</span>
                    {upstreamSnapshot.truncated && (
                      <span style={{ color: '#f59e0b' }}> · showing first {upstreamSnapshot.files.length}</span>
                    )}
                  </div>
                  <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                    <table className="w-full text-[11px]">
                      <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                        <tr>
                          <th className="px-2 py-1 text-left">File</th>
                          <th className="px-2 py-1 text-right">Size</th>
                          <th className="px-2 py-1 text-left">Status</th>
                          <th className="px-2 py-1 text-left">JSON</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upstreamSnapshot.files.map((f) => (
                          <tr key={f.name} style={{ borderTop: '1px solid var(--c-border)' }}>
                            <td className="px-2 py-1">
                              <a
                                href={f.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                                style={{ color: '#c4b5fd' }}
                              >
                                {f.name}
                              </a>
                            </td>
                            <td className="px-2 py-1 text-right" style={{ color: 'var(--c-text)' }}>
                              {formatBytes(f.size)}
                            </td>
                            <td className="px-2 py-1" style={{ color: f.warning ? '#f59e0b' : '#4ade80' }}>
                              {f.warning ? `warning: ${f.warning}` : 'parsed'}
                            </td>
                            <td className="px-2 py-1">
                              {f.parsedJson ? (
                                <details>
                                  <summary className="cursor-pointer" style={{ color: '#c4b5fd' }}>
                                    View JSON
                                  </summary>
                                  <pre
                                    className="mt-1 p-2 rounded overflow-auto"
                                    style={{ background: 'var(--c-bg)', color: '#d4cfff' }}
                                  >
                                    {toPrettyJson(f.parsedJson)}
                                  </pre>
                                </details>
                              ) : (
                                <span style={{ color: 'var(--c-muted)' }}>n/a</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
