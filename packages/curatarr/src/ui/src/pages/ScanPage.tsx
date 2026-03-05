import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, RefreshCw } from 'lucide-react';
import { api, type ScanHistoryRun } from '../api/client.js';
import { ScanProgressModal } from '../components/ScanProgressModal.js';
import { InfoHint } from '../components/InfoHint.js';

const JF_SYNC_HOW_IT_WORKS = `Jellyfin Sync — how it works

1. Fetches your entire movie library from Jellyfin in pages (100 items per batch).

2. For each Jellyfin item, tries to find the matching local folder using 5 strategies (in order):
   • Exact folder path match   → confidence 1.0
   • IMDb ID match             → confidence 1.0
   • Normalised title + year   → confidence 0.95
   • Normalised title only     → confidence 0.75 (flags year diff)
   • Fuzzy title (≥ 85% sim)  → confidence proportional

3. Matched movies are enriched with Jellyfin metadata:
   ratings, genres, IMDb/TMDb IDs, overview.

4. Ambiguous matches (year mismatch, fuzzy title) are flagged
   and visible on the Disambiguate page for manual review.

5. Results stream live over SSE — progress is visible in the
   modal that opens when you click "Sync from Jellyfin".

A full sync of 1 000+ movies typically takes 20–60 seconds,
depending on Jellyfin's response time.`;

type ModalMode = 'scan' | 'sync' | null;

export function Scan() {
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
        return note.replace(/all files already scanned/i, 'No changes detected — all files already scanned');
      }
      return note;
    }
    if (run.finished_at) return 'Completed';
    return 'In progress';
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
        <ScanLine size={20} style={{ color: 'var(--c-accent)' }} />
        Scan &amp; Sync
      </h1>

      {/* Scan section */}
      <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-[#d4cfff] flex items-center gap-2">
          <ScanLine size={16} className="text-[#a78bfa]" />
          Library Scan
        </h2>
        <p className="text-sm text-[#8b87aa]">
          Scan movie folders and video files (uses ffprobe on video files to refresh quality metadata).
          By default, already scanned files are skipped. Enable "Force rescan all files" below to re-scan all files.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-[#6b6888] block mb-1">Library Path (leave blank to use saved Movies roots)</label>
            <input
              type="text"
              placeholder="e.g. /media/Movies"
              value={scanPath}
              onChange={e => setScanPath(e.target.value)}
              className="w-full px-3 py-1.5 bg-[#1e1e2e] border border-[#26263a] rounded text-sm text-[#f0eeff] placeholder-gray-600 focus:outline-none focus:border-[#7c3aed]"
            />
          </div>
          <div>
            <label className="text-xs text-[#6b6888] block mb-1">Workers</label>
            <input
              type="number"
              min={1} max={16}
              value={jobs}
              onChange={e => setJobs(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-[#1e1e2e] border border-[#26263a] rounded text-sm text-[#f0eeff] focus:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#8b87aa] cursor-pointer">
          <input
            type="checkbox"
            checked={rescan}
            onChange={e => setRescan(e.target.checked)}
            className="accent-violet-600"
          />
          Force rescan all files
        </label>
        <p className="text-xs -mt-2" style={{ color: 'var(--c-muted)' }}>
          {rescan
            ? 'Checked: full rescan (slower, runs ffprobe again on all video files).'
            : 'Unchecked: incremental scan (faster, skips already scanned files).'}
        </p>

        <button
          onClick={triggerScan}
          disabled={scanRunning}
          className="flex items-center gap-2 px-5 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ScanLine size={15} />
          {scanRunning ? 'Scanning…' : (rescan ? 'Start Full Rescan' : 'Start Incremental Scan')}
        </button>
        {scanError && (
          <p className="text-sm text-red-400 mt-1">{scanError}</p>
        )}
      </div>

      {/* Sync section */}
      <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-[#d4cfff] flex items-center gap-2">
          <RefreshCw size={16} className="text-purple-400" />
          Jellyfin Sync
          <InfoHint label="How Jellyfin sync works" text={JF_SYNC_HOW_IT_WORKS} />
        </h2>
        <p className="text-sm text-[#8b87aa]">
          Fetch movie metadata from Jellyfin (ratings, genres, IDs) and enrich the local database.
          Requires Jellyfin URL and API key configured in Settings.
        </p>
        <button
          onClick={triggerSync}
          disabled={syncRunning}
          className="flex items-center gap-2 px-5 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={15} />
          {syncRunning ? 'Syncing…' : 'Sync from Jellyfin'}
        </button>
        {syncError && (
          <p className="text-sm text-red-400 mt-1">{syncError}</p>
        )}
      </div>

      {/* Scan history */}
      {histData?.runs && histData.runs.length > 0 && (
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-5">
          <h2 className="font-semibold text-[#d4cfff] mb-3">Scan History</h2>
          <div className="overflow-auto max-h-[26rem]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#6b6888] border-b border-[#26263a]">
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Folders</th>
                  <th className="pb-2 pr-4">Files</th>
                  <th className="pb-2 pr-4">OK</th>
                  <th className="pb-2 pr-4">Errors</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Result</th>
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
          onCompleted={() => { void refetchHistory(); }}
          onClose={() => { setModal(null); void refetchHistory(); }}
        />
      )}
    </div>
  );
}
