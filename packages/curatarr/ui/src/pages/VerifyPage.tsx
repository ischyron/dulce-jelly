import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Square, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { api, type VerifyFailure } from '../api/client.js';

interface VerifyProgress {
  total?: number;
  checked?: number;
  passed?: number;
  failed?: number;
  errors?: number;
  running?: boolean;
  cancelled?: boolean;
}

interface FileResult {
  fileId: number;
  filename: string;
  ok: boolean;
  errors: string[];
  durationMs: number;
}

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function VerifyPage() {
  const [concurrency, setConcurrency] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<VerifyProgress>({});
  const [recentResults, setRecentResults] = useState<FileResult[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [failPage, setFailPage] = useState(1);
  const esRef = useRef<EventSource | null>(null);

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['verify-status'],
    queryFn: api.verifyStatus,
    refetchInterval: running ? 5_000 : 30_000,
  });

  const { data: failData, refetch: refetchFailures } = useQuery({
    queryKey: ['verify-failures', failPage],
    queryFn: () => api.verifyFailures({ page: failPage, limit: 50 }),
  });

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  function connectSse() {
    esRef.current?.close();
    setRecentResults([]);
    setProgress({});
    setRunning(true);
    setStatusMsg('');

    const es = new EventSource('/api/verify/events');
    esRef.current = es;

    es.addEventListener('progress', (e: MessageEvent) => {
      const d = JSON.parse(e.data || '{}') as VerifyProgress;
      setProgress(d);
    });

    es.addEventListener('file_result', (e: MessageEvent) => {
      const d = JSON.parse(e.data || '{}') as FileResult;
      setRecentResults(prev => [...prev.slice(-200), d]);
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      const d = JSON.parse(e.data || '{}') as VerifyProgress;
      setProgress(d);
      setRunning(false);
      setStatusMsg(d.cancelled ? 'Cancelled.' : 'Complete.');
      refetchStatus();
      refetchFailures();
      es.close();
    });

    es.addEventListener('error', () => {
      setRunning(false);
      es.close();
    });
  }

  async function startVerify() {
    try {
      await api.verifyStart({ concurrency });
      connectSse();
    } catch (err) {
      setStatusMsg((err as Error).message);
    }
  }

  async function cancelVerify() {
    await api.verifyCancel();
  }

  const checked = progress.checked ?? 0;
  const total = progress.total ?? 0;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} style={{ color: 'var(--c-accent)' }} />
        <h1 className="text-xl font-bold">Deep Verify</h1>
      </div>

      {/* Status summary */}
      {statusData && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Unverified', value: statusData.unverified, color: 'var(--c-muted)' },
            { label: 'Passed', value: statusData.pass, color: '#4ade80' },
            { label: 'Failed', value: statusData.fail, color: '#f87171' },
            { label: 'Errors', value: statusData.error, color: '#fbbf24' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 border"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              <div className="text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="rounded-xl border p-5 space-y-4"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold text-sm">Deep Check Controls</h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Runs{' '}
          <code className="font-mono text-xs px-1 rounded" style={{ background: 'var(--c-border)' }}>
            ffmpeg -v error -f null -
          </code>{' '}
          on each file to detect corruption or truncation.
        </p>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span style={{ color: 'var(--c-muted)' }}>Concurrency</span>
            <input
              type="range" min={1} max={8} value={concurrency}
              onChange={e => setConcurrency(Number(e.target.value))}
              className="w-24"
              disabled={running}
            />
            <span className="font-mono text-sm w-4 text-center">{concurrency}</span>
          </label>

          {!running ? (
            <button
              onClick={startVerify}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--c-accent)' }}
            >
              <ShieldCheck size={15} />
              Start Deep Check
            </button>
          ) : (
            <button
              onClick={cancelVerify}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
            >
              <Square size={13} />
              Stop
            </button>
          )}

          {statusMsg && (
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{statusMsg}</span>
          )}
        </div>

        {/* Progress */}
        {running && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs" style={{ color: 'var(--c-muted)' }}>
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> Checking…
              </span>
              <span>{checked} / {total} ({pct}%)</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: 'var(--c-accent)' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#4ade80' }}>{progress.passed ?? 0}</div>
                <div style={{ color: 'var(--c-muted)' }}>Passed</div>
              </div>
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#f87171' }}>{progress.failed ?? 0}</div>
                <div style={{ color: 'var(--c-muted)' }}>Failed</div>
              </div>
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#fbbf24' }}>{progress.errors ?? 0}</div>
                <div style={{ color: 'var(--c-muted)' }}>Errors</div>
              </div>
            </div>
          </div>
        )}

        {/* Live file result stream */}
        {recentResults.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: 'var(--c-muted)' }}>
              Live Results (last {recentResults.length})
            </h3>
            <div className="rounded p-2 space-y-0.5 max-h-40 overflow-y-auto text-xs font-mono"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
              {recentResults.slice(-100).map((r, i) => (
                <div key={i} className="flex items-center gap-2 truncate">
                  {r.ok
                    ? <CheckCircle2 size={10} style={{ color: '#4ade80', flexShrink: 0 }} />
                    : <XCircle size={10} style={{ color: '#f87171', flexShrink: 0 }} />
                  }
                  <span className="truncate" style={{ color: r.ok ? 'var(--c-text)' : '#fca5a5' }}>
                    {r.filename}
                  </span>
                  <span className="ml-auto shrink-0" style={{ color: 'var(--c-muted)' }}>
                    {(r.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Failures table */}
      {(failData?.total ?? 0) > 0 && (
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--c-border)' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <AlertCircle size={15} style={{ color: '#f87171' }} />
              Verification Failures
            </h2>
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {failData?.total} total
            </span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b text-left"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                  <th className="px-4 py-2">Filename</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Errors</th>
                  <th className="px-4 py-2">Verified At</th>
                </tr>
              </thead>
              <tbody>
                {(failData?.failures ?? []).map((f: VerifyFailure) => {
                  const errs = (() => {
                    try { return JSON.parse(f.verify_errors ?? '[]') as string[]; } catch { return []; }
                  })();
                  return (
                    <tr key={f.id} className="border-b"
                      style={{ borderColor: 'var(--c-border)' }}>
                      <td className="px-4 py-2.5 font-mono text-xs max-w-xs truncate"
                        style={{ color: '#fca5a5' }}>
                        {f.filename}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                        {formatBytes(f.file_size)}
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-sm truncate"
                        style={{ color: '#fbbf24' }}>
                        {errs[0] ?? '—'}
                        {errs.length > 1 && <span style={{ color: 'var(--c-muted)' }}> +{errs.length - 1}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                        {f.verified_at ? f.verified_at.slice(0, 16) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {failData && failData.total > failData.limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-xs"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
              <span>Page {failPage} of {Math.ceil(failData.total / failData.limit)}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setFailPage(p => Math.max(1, p - 1))}
                  disabled={failPage === 1}
                  className="px-2 py-1 rounded disabled:opacity-40"
                  style={{ background: 'var(--c-border)' }}
                >
                  Prev
                </button>
                <button
                  onClick={() => setFailPage(p => p + 1)}
                  disabled={failPage >= Math.ceil(failData.total / failData.limit)}
                  className="px-2 py-1 rounded disabled:opacity-40"
                  style={{ background: 'var(--c-border)' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
