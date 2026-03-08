import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, type VerifyFailure, api } from '../api/client';

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

interface FileStart {
  fileId: number;
  filename: string;
  startedAt?: string;
}

interface QualityFlag {
  severity: 'FLAG' | 'WARN';
  code: string;
  message: string;
  detail?: string;
}

interface CuratedIssue {
  severity: 'FLAG' | 'WARN';
  title: string;
  impact: string;
}

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function parseStringArray(input: string | null): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function parseQualityFlags(input: string | null): QualityFlag[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is QualityFlag =>
        typeof v === 'object' &&
        v !== null &&
        (v as { severity?: unknown }).severity !== undefined &&
        typeof (v as { code?: unknown }).code === 'string' &&
        typeof (v as { message?: unknown }).message === 'string',
    );
  } catch {
    return [];
  }
}

function buildCuratedIssues(errors: string[], flags: QualityFlag[]): CuratedIssue[] {
  const curated: CuratedIssue[] = [];
  const seen = new Set<string>();
  const push = (severity: 'FLAG' | 'WARN', title: string, impact: string) => {
    const key = `${severity}:${title}`;
    if (seen.has(key)) return;
    seen.add(key);
    curated.push({ severity, title, impact });
  };

  for (const flag of flags) {
    if (flag.code === 'decode_error') {
      push('FLAG', 'Bitstream/Decode corruption', 'Playback may freeze, macroblock, or stop at damaged frames.');
    } else if (flag.code === 'mux_error') {
      push('FLAG', 'Container/Mux integrity issue', 'Players may fail to open, seek, or parse tracks reliably.');
    } else if (flag.code === 'backward_pts') {
      push('FLAG', 'Timestamp disorder (non-monotonic DTS/PTS)', 'Can cause stutter, random jumps, or A/V sync drift.');
    }
  }

  for (const err of errors) {
    const line = err.toLowerCase();
    if (line.includes('invalid nal unit size') || line.includes('decode_slice_header') || line.includes('invalid')) {
      push('FLAG', 'H.264/H.265 bitstream damage', 'Decoder encountered malformed NAL/slice data; playback may break.');
    } else if (line.includes('non monoton') || line.includes('out of order packet')) {
      push('FLAG', 'Non-monotonic DTS/PTS', 'Timestamp flow is broken and can produce visible playback glitches.');
    } else if (line.includes('moov atom not found') || line.includes('invalid atom size')) {
      push('FLAG', 'Container metadata corruption', 'Stream metadata is damaged; file may fail open or be unseekable.');
    } else if (line.startsWith('timeout:')) {
      push('WARN', 'Verification timeout', 'The scan did not finish in time; result confidence is reduced.');
    } else if (line.startsWith('spawn error')) {
      push(
        'WARN',
        'Verifier runtime failure',
        'System ffmpeg execution failed; this is environment/tooling, not media quality.',
      );
    }
  }

  return curated;
}

export function Verify() {
  const { t } = useTranslation('verify');
  const [concurrency, setConcurrency] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<VerifyProgress>({});
  const [activeFiles, setActiveFiles] = useState<FileStart[]>([]);
  const [recentResults, setRecentResults] = useState<FileResult[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [failPage, setFailPage] = useState(1);
  const [clearingFailures, setClearingFailures] = useState(false);
  const [recheckingFileId, setRecheckingFileId] = useState<number | null>(null);
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null);
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

  const connectSse = useCallback(() => {
    esRef.current?.close();
    setActiveFiles([]);
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
      setActiveFiles((prev) => prev.filter((f) => f.fileId !== d.fileId));
      setRecentResults((prev) => [...prev.slice(-200), d]);
    });

    es.addEventListener('file_start', (e: MessageEvent) => {
      const d = JSON.parse(e.data || '{}') as FileStart;
      setActiveFiles((prev) => {
        const next = prev.filter((f) => f.fileId !== d.fileId);
        return [...next, d];
      });
    });

    es.addEventListener('complete', (e: MessageEvent) => {
      const d = JSON.parse(e.data || '{}') as VerifyProgress;
      setProgress(d);
      setActiveFiles([]);
      setRunning(false);
      setStatusMsg(d.cancelled ? t('controls.cancelled') : t('controls.complete'));
      refetchStatus();
      refetchFailures();
      es.close();
    });

    es.addEventListener('error', () => {
      setActiveFiles([]);
      setRunning(false);
      es.close();
    });
  }, [refetchFailures, refetchStatus, t]);

  // Sync running state from server on mount / status refresh.
  useEffect(() => {
    if (statusData?.running && !running) {
      // Server says verify is running but UI thinks it's not — reconnect to SSE
      connectSse();
    }
  }, [connectSse, running, statusData?.running]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  async function startVerify() {
    try {
      await api.verifyStart({ concurrency });
      connectSse();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 409) {
        const msg = t('controls.alreadyRunning');
        setStatusMsg(msg);
        window.alert(t('controls.alreadyRunningAlert'));
      } else {
        setStatusMsg((err as Error).message);
      }
    }
  }

  async function cancelVerify() {
    await api.verifyCancel();
  }

  async function clearFailures() {
    if (running || statusData?.running || clearingFailures) return;
    setClearingFailures(true);
    try {
      const res = await api.verifyClear();
      setStatusMsg(t('failures.cleared', { count: res.cleared }));
      await Promise.all([refetchStatus(), refetchFailures()]);
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setClearingFailures(false);
    }
  }

  async function recheckFailure(fileId: number) {
    if (running || statusData?.running || recheckingFileId != null) return;
    setRecheckingFileId(fileId);
    try {
      await api.verifyStart({ concurrency: 1, fileIds: [fileId], rescan: true });
      connectSse();
      setStatusMsg(t('failures.recheckStarted'));
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 409) {
        const msg = t('controls.alreadyRunning');
        setStatusMsg(msg);
        window.alert(t('controls.alreadyRunningAlert'));
      } else {
        setStatusMsg((err as Error).message);
      }
    } finally {
      setRecheckingFileId(null);
    }
  }

  async function copyFailureDiagnostics(filename: string, errors: string[], curated: CuratedIssue[]) {
    const payload = [
      `File: ${filename}`,
      '',
      'Curated impact:',
      ...(curated.length > 0 ? curated.map((item) => `[${item.severity}] ${item.title}: ${item.impact}`) : ['None']),
      '',
      'Raw diagnostics:',
      ...(errors.length > 0 ? errors : ['None']),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(payload);
      setStatusMsg(t('failures.copyOk'));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(ta);
      setStatusMsg(copied ? t('failures.copyOk') : t('failures.copyFail'));
    }
  }

  const checked = progress.checked ?? 0;
  const total = progress.total ?? 0;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const verifyInProgress = running || Boolean(statusData?.running);
  const clearableCount = (statusData?.pass ?? 0) + (statusData?.fail ?? 0) + (statusData?.error ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} style={{ color: 'var(--c-accent)' }} />
        <h1 className="text-xl font-bold">{t('pageTitle')}</h1>
      </div>

      {/* Status summary */}
      {statusData && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: t('stats.unverified'), value: statusData.unverified, color: 'var(--c-muted)' },
            { label: t('stats.passed'), value: statusData.pass, color: '#4ade80' },
            { label: t('stats.failed'), value: statusData.fail, color: '#f87171' },
            { label: t('stats.errors'), value: statusData.error, color: '#fbbf24' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="rounded-xl p-4 border"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
            >
              <div className="text-2xl font-bold" style={{ color }}>
                {value.toLocaleString()}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div
        className="rounded-xl border p-5 space-y-4"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        <h2 className="font-semibold text-sm">{t('controls.title')}</h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          {t('controls.descriptionPrefix')}
          <code className="font-mono text-xs px-1 rounded" style={{ background: 'var(--c-border)' }}>
            ffmpeg -v error -f null -
          </code>
          {t('controls.descriptionSuffix')}
        </p>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span style={{ color: 'var(--c-muted)' }}>{t('controls.concurrency')}</span>
            <input
              type="range"
              min={1}
              max={8}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-24"
              disabled={verifyInProgress}
            />
            <span className="font-mono text-sm w-4 text-center">{concurrency}</span>
          </label>

          {!verifyInProgress ? (
            <button
              type="button"
              onClick={startVerify}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--c-accent)' }}
            >
              <ShieldCheck size={15} />
              {t('controls.start')}
            </button>
          ) : (
            <button
              type="button"
              onClick={cancelVerify}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
            >
              <Square size={13} />
              {t('controls.stop')}
            </button>
          )}

          {statusMsg && (
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {statusMsg}
            </span>
          )}
          <button
            type="button"
            onClick={clearFailures}
            disabled={verifyInProgress || clearingFailures || clearableCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border disabled:opacity-40"
            style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(248,113,113,0.12)' }}
            title={t('failures.clearTitle')}
          >
            <Trash2 size={12} />
            {t('failures.clear')}
          </button>
        </div>

        {/* Progress */}
        {verifyInProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs" style={{ color: 'var(--c-muted)' }}>
              <span className="flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> {t('controls.checking')}
              </span>
              <span>
                {checked} / {total} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
              <div
                role="progressbar"
                tabIndex={0}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('controls.progressAriaLabel')}
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: 'var(--c-accent)' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#4ade80' }}>
                  {progress.passed ?? 0}
                </div>
                <div style={{ color: 'var(--c-muted)' }}>{t('stats.passed')}</div>
              </div>
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#f87171' }}>
                  {progress.failed ?? 0}
                </div>
                <div style={{ color: 'var(--c-muted)' }}>{t('stats.failed')}</div>
              </div>
              <div className="rounded p-2" style={{ background: 'var(--c-bg)' }}>
                <div className="font-bold" style={{ color: '#fbbf24' }}>
                  {progress.errors ?? 0}
                </div>
                <div style={{ color: 'var(--c-muted)' }}>{t('stats.errors')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Live started/running file stream */}
        {verifyInProgress && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-muted)' }}>
              {t('live.runningTitle', { count: activeFiles.length })}
            </h3>
            <div
              className="rounded p-2 space-y-0.5 max-h-32 overflow-y-auto text-xs font-mono"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
            >
              {activeFiles.length === 0 ? (
                <div style={{ color: 'var(--c-muted)' }}>{t('live.waiting')}</div>
              ) : (
                activeFiles.map((f) => (
                  <div key={`${f.fileId}:${f.startedAt ?? ''}`} className="flex items-center gap-2 truncate">
                    <Loader2 size={10} className="animate-spin" style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
                    <span className="truncate">{f.filename}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Live file result stream */}
        {recentResults.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--c-muted)' }}>
              {t('live.title', { count: recentResults.length })}
            </h3>
            <div
              className="rounded p-2 space-y-0.5 max-h-40 overflow-y-auto text-xs font-mono"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
            >
              {recentResults.slice(-100).map((r) => (
                <div key={`${r.fileId}:${r.durationMs}:${r.filename}`} className="flex items-center gap-2 truncate">
                  {r.ok ? (
                    <CheckCircle2 size={10} style={{ color: '#4ade80', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={10} style={{ color: '#f87171', flexShrink: 0 }} />
                  )}
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
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--c-border)' }}
          >
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <AlertCircle size={15} style={{ color: '#f87171' }} />
              {t('failures.title')}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                {t('failures.total', { count: failData?.total })}
              </span>
              <button
                type="button"
                onClick={clearFailures}
                disabled={verifyInProgress || clearingFailures || clearableCount === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border disabled:opacity-40"
                style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(248,113,113,0.12)' }}
                title={t('failures.clearTitle')}
              >
                <Trash2 size={12} />
                {t('failures.clear')}
              </button>
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-xs border-b text-left"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                >
                  <th className="px-4 py-2">{t('failures.colFilename')}</th>
                  <th className="px-4 py-2">{t('failures.colSize')}</th>
                  <th className="px-4 py-2">{t('failures.colErrors')}</th>
                  <th className="px-4 py-2">{t('failures.colVerifiedAt')}</th>
                  <th className="px-4 py-2">{t('failures.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {(failData?.failures ?? []).map((f: VerifyFailure) => {
                  const errs = parseStringArray(f.verify_errors);
                  const flags = parseQualityFlags(f.quality_flags ?? '[]');
                  const curated = buildCuratedIssues(errs, flags);
                  const showDetails = expandedFailureId === f.id;
                  return (
                    <Fragment key={f.id}>
                      <tr className="border-b" style={{ borderColor: 'var(--c-border)' }}>
                        <td className="px-4 py-2.5 font-mono text-xs max-w-xs truncate" style={{ color: '#fca5a5' }}>
                          {f.filename}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                          {formatBytes(f.file_size)}
                        </td>
                        <td className="px-4 py-2.5 text-xs max-w-sm truncate" style={{ color: '#fbbf24' }}>
                          {errs[0] ?? '—'}
                          {errs.length > 1 && <span style={{ color: 'var(--c-muted)' }}> +{errs.length - 1}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                          {f.verified_at ? f.verified_at.slice(0, 16) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedFailureId((prev) => (prev === f.id ? null : f.id))}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border"
                              style={{
                                borderColor: 'var(--c-border)',
                                color: 'var(--c-text)',
                                background: 'rgba(251,191,36,0.12)',
                              }}
                            >
                              <AlertCircle size={11} />
                              {showDetails ? t('failures.hideDetails') : t('failures.details')}
                            </button>
                            <button
                              type="button"
                              onClick={() => recheckFailure(f.id)}
                              disabled={verifyInProgress || recheckingFileId !== null}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border disabled:opacity-40"
                              style={{
                                borderColor: 'var(--c-border)',
                                color: 'var(--c-text)',
                                background: 'rgba(99,102,241,0.12)',
                              }}
                              title={verifyInProgress ? t('failures.recheckDisabledTitle') : t('failures.recheckTitle')}
                            >
                              <RotateCcw size={11} />
                              {recheckingFileId === f.id ? t('failures.rechecking') : t('failures.recheck')}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {showDetails && (
                        <tr className="border-b" style={{ borderColor: 'var(--c-border)' }}>
                          <td colSpan={5} className="px-4 py-3">
                            <div
                              className="rounded-lg border p-3 space-y-3"
                              style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}
                            >
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-semibold uppercase" style={{ color: 'var(--c-muted)' }}>
                                  {t('failures.detailsTitle')}
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => copyFailureDiagnostics(f.filename, errs, curated)}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs"
                                  style={{
                                    borderColor: 'var(--c-border)',
                                    color: 'var(--c-text)',
                                    background: 'rgba(74,222,128,0.12)',
                                  }}
                                >
                                  <Copy size={11} />
                                  {t('failures.copy')}
                                </button>
                              </div>
                              <div>
                                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--c-muted)' }}>
                                  {t('failures.curatedImpact')}
                                </div>
                                {curated.length === 0 ? (
                                  <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                                    {t('failures.none')}
                                  </div>
                                ) : (
                                  <ul className="space-y-1 text-xs">
                                    {curated.map((item) => (
                                      <li key={`${item.severity}:${item.title}`}>
                                        <span style={{ color: item.severity === 'FLAG' ? '#f87171' : '#fbbf24' }}>
                                          [{item.severity}]
                                        </span>{' '}
                                        <span style={{ color: 'var(--c-text)' }}>{item.title}</span>{' '}
                                        <span style={{ color: 'var(--c-muted)' }}>{item.impact}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--c-muted)' }}>
                                  {t('failures.rawErrors')}
                                </div>
                                <textarea
                                  readOnly
                                  value={errs.length > 0 ? errs.join('\n') : t('failures.none')}
                                  className="w-full h-36 rounded border px-2 py-1.5 text-xs font-mono"
                                  style={{
                                    background: 'var(--c-surface)',
                                    borderColor: 'var(--c-border)',
                                    color: 'var(--c-text)',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {failData && failData.total > failData.limit && (
            <div
              className="flex items-center justify-between px-4 py-3 border-t text-xs"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
            >
              <span>
                {t('failures.page', { current: failPage, total: Math.ceil(failData.total / failData.limit) })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFailPage((p) => Math.max(1, p - 1))}
                  disabled={failPage === 1}
                  className="px-2 py-1 rounded disabled:opacity-40"
                  style={{ background: 'var(--c-border)' }}
                >
                  {t('failures.prev')}
                </button>
                <button
                  type="button"
                  onClick={() => setFailPage((p) => p + 1)}
                  disabled={failPage >= Math.ceil(failData.total / failData.limit)}
                  className="px-2 py-1 rounded disabled:opacity-40"
                  style={{ background: 'var(--c-border)' }}
                >
                  {t('failures.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
