import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ScanHistoryRun, api } from '../api/client';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';
import { ScanProgressModal } from '../components/shared/modals';

type ModalMode = 'scan' | 'sync' | null;

export function Scan() {
  const { t } = useTranslation('scan');
  const [modal, setModal] = useState<ModalMode>(null);
  const [scanPath, setScanPath] = useState('');
  const [jobs, setJobs] = useState(4);
  const [rescan, setRescan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data: scanStatusData } = useQuery({
    queryKey: ['scan-status'],
    queryFn: api.scanStatus,
    refetchInterval: 3_000,
  });

  const { data: syncStatusData } = useQuery({
    queryKey: ['sync-status'],
    queryFn: api.syncStatus,
    refetchInterval: 3_000,
  });

  const scanRunning = scanStatusData?.running ?? modal === 'scan';
  const syncRunning = syncStatusData?.running ?? modal === 'sync';

  const { data: histData, refetch: refetchHistory } = useQuery({
    queryKey: ['scan-history'],
    queryFn: api.scanHistory,
  });

  async function triggerScan() {
    setScanError(null);
    try {
      await api.triggerScan({ path: scanPath || undefined, jobs, rescan });
      setModal('scan');
      refetchHistory();
    } catch (err) {
      setScanError((err as Error).message);
    }
  }

  async function triggerSync() {
    setSyncError(null);
    try {
      await api.triggerSync({});
      setModal('sync');
    } catch (err) {
      setSyncError((err as Error).message);
    }
  }

  function formatScanResult(run: ScanHistoryRun): string {
    const note = (run.notes ?? '').trim();
    if (note) {
      if (note.toLowerCase().includes('all files already scanned')) {
        return note.replace(/all files already scanned/i, t('history.noChanges'));
      }
      return note;
    }
    if (run.finished_at) return t('history.completed');
    return t('history.inProgress');
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={ScanLine} title={t('title')} />
      <div className="px-6 py-6 space-y-6 max-w-3xl">
        {/* Scan section */}
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-[#d4cfff] flex items-center gap-2">
            <ScanLine size={16} className="text-[#a78bfa]" />
            {t('scanSection.title')}
          </h2>
          <p className="text-sm text-[#8b87aa]">{t('scanSection.description')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="scan-library-path" className="text-xs text-[#8b87aa] block mb-1">
                {t('scanSection.libraryPathLabel')}
              </label>
              <input
                id="scan-library-path"
                type="text"
                placeholder="e.g. /media/Movies"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#1e1e2e] border border-[#26263a] rounded text-sm text-[#f0eeff] placeholder-gray-600 focus:outline-none focus:border-[#7c3aed]"
              />
            </div>
            <div>
              <label htmlFor="scan-workers" className="text-xs text-[#8b87aa] block mb-1">
                {t('scanSection.workersLabel')}
              </label>
              <input
                id="scan-workers"
                type="number"
                min={1}
                max={16}
                value={jobs}
                onChange={(e) => setJobs(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-[#1e1e2e] border border-[#26263a] rounded text-sm text-[#f0eeff] focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#8b87aa] cursor-pointer">
            <input
              type="checkbox"
              checked={rescan}
              onChange={(e) => setRescan(e.target.checked)}
              className="accent-violet-600"
            />
            {t('scanSection.forceRescan')}
          </label>
          <p className="text-xs -mt-2" style={{ color: 'var(--c-muted)' }}>
            {rescan ? t('scanSection.rescanChecked') : t('scanSection.rescanUnchecked')}
          </p>

          <button
            type="button"
            onClick={triggerScan}
            disabled={scanRunning}
            className="flex items-center gap-2 px-5 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ScanLine size={15} />
            {scanRunning
              ? t('scanSection.scanning')
              : rescan
                ? t('scanSection.startRescan')
                : t('scanSection.startScan')}
          </button>
          {scanError && <p className="text-sm text-red-400 mt-1">{scanError}</p>}
        </div>

        {/* Sync section */}
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-[#d4cfff] flex items-center gap-2">
            <RefreshCw size={16} className="text-purple-400" />
            {t('syncSection.title')}
            <InfoHint label={t('syncSection.hintLabel')} text={t('syncSection.guide')} />
          </h2>
          <div
            className="rounded-xl border p-3 text-sm space-y-2"
            style={{ borderColor: 'rgba(124,58,237,0.45)', background: 'linear-gradient(135deg, #191730, #111625)' }}
          >
            <p className="text-[#cdc3ff] font-medium">{t('syncSection.description')}</p>
            <p className="text-[#8b87aa] text-xs">
              Curatarr only stores decision-critical fields and always defers full metadata presentation to Jellyfin.
            </p>
          </div>
          <button
            type="button"
            onClick={triggerSync}
            disabled={syncRunning}
            className="flex items-center gap-2 px-5 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={15} />
            {syncRunning ? t('syncSection.syncing') : t('syncSection.cta')}
          </button>
          {syncError && <p className="text-sm text-red-400 mt-1">{syncError}</p>}
        </div>

        {/* Scan history */}
        {histData?.runs && histData.runs.length > 0 && (
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5">
            <h2 className="font-semibold text-[#d4cfff] mb-3">{t('history.title')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[#8b87aa] border-b border-[#26263a]">
                    <th className="pb-2 pr-4">{t('history.started')}</th>
                    <th className="pb-2 pr-4">{t('history.folders')}</th>
                    <th className="pb-2 pr-4">{t('history.files')}</th>
                    <th className="pb-2 pr-4">{t('history.ok')}</th>
                    <th className="pb-2 pr-4">{t('history.errors')}</th>
                    <th className="pb-2 pr-4">{t('history.duration')}</th>
                    <th className="pb-2">{t('history.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {histData.runs.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-[#26263a]/40 text-[#c4b5fd]">
                      <td className="py-1.5 pr-4 text-xs text-[#8b87aa]">{r.started_at ?? '—'}</td>
                      <td className="py-1.5 pr-4">{r.total_folders ?? '—'}</td>
                      <td className="py-1.5 pr-4">{r.total_files ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-green-400">{r.scanned_ok ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-red-400">{r.scan_errors ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-xs text-[#8b87aa]">
                        {r.duration_sec ? `${Number(r.duration_sec).toFixed(1)}s` : '—'}
                      </td>
                      <td className="py-1.5 text-xs" style={{ color: 'var(--c-muted)' }} title={r.notes ?? undefined}>
                        {formatScanResult(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {modal && (
          <ScanProgressModal
            mode={modal}
            onCompleted={() => {
              void refetchHistory();
            }}
            onClose={() => {
              setModal(null);
              void refetchHistory();
            }}
          />
        )}
      </div>
    </div>
  );
}
