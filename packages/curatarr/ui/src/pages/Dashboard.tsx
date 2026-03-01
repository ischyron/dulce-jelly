import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Film, ScanLine, CheckCircle, AlertCircle, Rocket } from 'lucide-react';
import { api } from '../api/client.js';
import { ResolutionPieChart, CodecBarChart } from '../components/Charts.js';
import { ScanProgressModal } from '../components/ScanProgressModal.js';

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
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
      <div className={`flex items-center gap-2 mb-2 text-sm ${color}`}>
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-[#f0eeff]">{value}</div>
      {sub && <div className="text-xs text-[#6b6888] mt-0.5">{sub}</div>}
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
        <button
          onClick={() => setShowScanModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-sm font-medium"
        >
          <ScanLine size={16} />
          Scan Library
        </button>
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
        <Link to="/library" className="block hover:opacity-80 transition-opacity">
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
          sub={`${data.jfEnriched} matched · ${data.totalMovies - data.jfEnriched} unmatched`}
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
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span>
            <span className="text-amber-400 font-medium">{data.hdrCount}</span>
            <span className="text-[#8b87aa]"> HDR</span>
          </span>
          <span className="text-[#26263a]">·</span>
          <span>
            <span className="text-amber-400 font-medium">{data.dolbyVisionCount}</span>
            <span className="text-[#8b87aa]"> Dolby Vision</span>
          </span>
          {(data.codecDist['av1'] ?? 0) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <span title="AV1 files may not hardware-decode on Android TV / older sticks">
                <span className="text-emerald-400 font-medium">{data.codecDist['av1']}</span>
                <span className="text-[#8b87aa]"> AV1 </span>
                <span className="text-amber-400 text-xs">⚠ check client compat</span>
              </span>
            </>
          )}
          {((data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <span title="Legacy codec — consider replacement">
                <span className="text-orange-400 font-medium">
                  {(data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)}
                </span>
                <span className="text-[#8b87aa]"> legacy codec</span>
              </span>
            </>
          )}
        </div>
        {lastScan && (
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-xs text-[#8b87aa]">
            Last scan: {String(lastScan.started_at ?? '—')} &nbsp;·&nbsp;
            {String(lastScan.scanned_ok ?? 0)} ok / {String(lastScan.scan_errors ?? 0)} errors &nbsp;·&nbsp;
            {lastScan.duration_sec ? `${Number(lastScan.duration_sec).toFixed(0)}s` : ''}
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
