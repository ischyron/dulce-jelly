import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Film, ScanLine, CheckCircle, AlertCircle, Rocket, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import { ResolutionPieChart, CodecBarChart } from '../components/Charts.js';
import { ScanProgressModal } from '../components/ScanProgressModal.js';

function fmtSyncDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = d.toLocaleString('en-US', { month: 'short' });
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mmm}-${yyyy} ${hh}:${mm}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-[#a78bfa]',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 h-full flex flex-col">
      <div className={`flex items-center gap-2 mb-2 text-sm ${color}`}>
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-[#f0eeff]">{value}</div>
      <div className="text-xs text-[#6b6888] mt-0.5 min-h-[16px] truncate" title={sub ?? ''}>
        {sub ?? ''}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: 30_000,
  });

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanLaunching, setScanLaunching] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function triggerDashboardScan() {
    setScanError(null);
    setScanLaunching(true);
    try {
      await api.triggerScan({});
      setShowScanModal(true);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      setScanLaunching(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-[#6b6888]">Loading stats…</div>;
  }
  if (error || !data) {
    return <div className="p-8 text-red-400">Failed to load stats. Is the server running?</div>;
  }

  const jfPct = data.totalMovies > 0
    ? Math.round((data.jfEnriched / data.totalMovies) * 100)
    : 0;

  const lastScan = data.lastScan as Record<string, unknown> | undefined;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#f0eeff]">Dashboard</h1>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={triggerDashboardScan}
            disabled={scanLaunching}
            className="flex items-center gap-2 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {scanLaunching
              ? <><Loader2 size={16} className="animate-spin" /> Starting…</>
              : <><ScanLine size={16} /> Scan Library</>}
          </button>
          {scanError && (
            <p className="text-xs text-red-400 max-w-xs text-right">{scanError}</p>
          )}
        </div>
      </div>

      {/* Onboarding banner for fresh installs */}
      {data.totalMovies === 0 && (
        <div className="bg-[#1a1030] border border-[#7c3aed]/40 rounded-xl p-5 flex gap-4 items-start">
          <Rocket size={22} className="text-[#a78bfa] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#d4cfff]">Welcome to Curatarr!</p>
            <p className="text-sm text-[#8b87aa]">
              Your library is empty. To get started:
            </p>
            <ol className="text-sm text-[#8b87aa] list-decimal list-inside space-y-0.5 mt-1">
              <li>Go to <Link to="/settings" className="text-[#a78bfa] hover:underline">Settings</Link> and set your Library Path (e.g. <code className="font-mono text-xs px-1 rounded bg-[#26263a]">/media</code>).</li>
              <li>Return here and click <strong className="text-[#c4b5fd]">Scan Library</strong> to analyse your files with ffprobe.</li>
              <li>Optionally run <Link to="/scan" className="text-[#a78bfa] hover:underline">Jellyfin Sync</Link> to enrich metadata from Jellyfin.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/library?reset=1" className="block h-full hover:opacity-80 transition-opacity">
          <StatCard icon={Film} label="Total Movies" value={data.totalMovies.toLocaleString()} />
        </Link>
        <StatCard
          icon={CheckCircle}
          label="Scanned"
          value={`${data.scannedFiles.toLocaleString()} / ${data.totalFiles.toLocaleString()}`}
          sub={data.totalFiles > data.scannedFiles ? `${(data.totalFiles - data.scannedFiles).toLocaleString()} pending` : 'All scanned'}
          color="text-green-400"
        />
        <StatCard
          icon={Film}
          label="Jellyfin Synced"
          value={`${jfPct}%`}
          sub={
            <>
              <span className="text-[#d4cfff] font-semibold">{data.jfEnriched}</span>
              <span className="text-[#6b6888]"> matched</span>
              <span className="text-[#6b6888]"> · </span>
              <span className="text-amber-400 font-semibold">{data.totalMovies - data.jfEnriched}</span>
              <span className="text-[#6b6888]"> unmatched</span>
            </>
          }
          color="text-purple-400"
        />
        <StatCard
          icon={AlertCircle}
          label="Scan Errors"
          value={data.errorFiles}
          color={data.errorFiles > 0 ? 'text-red-400' : 'text-[#6b6888]'}
        />
      </div>

      {/* HDR + codec summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">
            Video Codec
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <Link to="/library?hdr=1" className="hover:underline" title="Show HDR files in Library">
            <span className="text-amber-400 font-medium">{data.hdrCount}</span>
            <span className="text-[#8b87aa]"> HDR</span>
          </Link>
          <span className="text-[#26263a]">·</span>
          <Link to="/library?dv=1" className="hover:underline" title="Show Dolby Vision files in Library">
            <span className="text-amber-400 font-medium">{data.dolbyVisionCount}</span>
            <span className="text-[#8b87aa]"> Dolby Vision</span>
          </Link>
          {(data.codecDist['av1'] ?? 0) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <Link to="/library?av1Compat=1"
                className="hover:underline"
                title="AV1 files may not hardware-decode on Android TV / older sticks — click to view in Library">
                <span className="text-emerald-400 font-medium">{data.codecDist['av1']}</span>
                <span className="text-[#8b87aa]"> AV1 </span>
                <span className="text-amber-400 text-xs">⚠ compat</span>
              </Link>
            </>
          )}
          {((data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <Link to="/library?legacy=1"
                className="hover:underline"
                title="Legacy codec — click to filter in Library">
                <span className="text-orange-400 font-medium">
                  {(data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)}
                </span>
                <span className="text-[#8b87aa]"> legacy codec</span>
              </Link>
            </>
          )}
          </div>
        </div>
        {lastScan && (
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
            <div className="text-xs text-[#8b87aa] mb-1">
              Last scan: <span className="text-[#d4cfff] font-semibold">{fmtSyncDate(String(lastScan.started_at ?? '—'))}</span>
              {lastScan.duration_sec ? <><span className="text-[#26263a] mx-2">·</span>{Number(lastScan.duration_sec).toFixed(0)}s</> : null}
            </div>
            <div className="text-sm">
              <span className="text-emerald-400 font-semibold text-base">{String(lastScan.scanned_ok ?? 0)}</span>
              <span className="text-[#6b6888] ml-1 mr-3">ok</span>
              <span className="text-red-400 font-semibold text-base">{String(lastScan.scan_errors ?? 0)}</span>
              <span className="text-[#6b6888] ml-1">errors</span>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
          <h2 className="text-sm font-medium text-[#8b87aa] mb-3">Resolution Distribution</h2>
          <ResolutionPieChart data={data.resolutionDist} />
        </div>
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
          <h2 className="text-sm font-medium text-[#8b87aa] mb-3">Codec Distribution</h2>
          <CodecBarChart data={data.codecDist} />
        </div>
      </div>

      {showScanModal && (
        <ScanProgressModal mode="scan" onClose={() => setShowScanModal(false)} />
      )}
    </div>
  );
}
