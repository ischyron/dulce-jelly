import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Film, LayoutDashboard, ScanLine, CheckCircle, AlertCircle, Rocket, Loader2 } from 'lucide-react';
import { api } from '../api/client.js';
import { ResolutionPieChart, CodecBarChart } from '../components/Charts.js';
import { ScanProgressModal } from '../components/ScanProgressModal.js';
import { InfoHint } from '../components/InfoHint.js';

function JellyfinIcon({ size = 16, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-label="Jellyfin"
      {...props}
    >
      <path d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z" />
    </svg>
  );
}

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
  subWrap = false,
  infoText,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  color?: string;
  subWrap?: boolean;
  infoText?: string;
}) {
  return (
    <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 h-full min-h-[138px] flex flex-col">
      <div className={`flex items-center gap-2 mb-2 text-sm ${color}`}>
        <Icon size={16} />
        <span>{label}</span>
        {infoText && <InfoHint label={`${label} info`} text={infoText} />}
      </div>
      <div className="text-2xl font-bold text-[#f0eeff]">{value}</div>
      <div
        className={`text-xs text-[#6b6888] mt-0.5 min-h-[16px] ${subWrap ? 'leading-5 whitespace-normal break-words' : 'truncate'}`}
        title={typeof sub === 'string' ? sub : undefined}
      >
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
  const lastScanSummary = lastScan ? (
    <div className="space-y-0.5 leading-5">
      <div>
        Last scan: {fmtSyncDate(String(lastScan.started_at ?? '—'))} ({Number(lastScan.duration_sec ?? 0).toFixed(0)}s)
      </div>
      <div>
        <span className="text-emerald-400 font-semibold">{String(lastScan.scanned_ok ?? 0)}</span>
        <span className="text-[#8b87aa]"> ok </span>
        <span className="text-red-400 font-semibold">{String(lastScan.scan_errors ?? 0)}</span>
        <span className="text-[#8b87aa]"> errors</span>
      </div>
    </div>
  ) : undefined;
  const audioQuickLinks = Object.entries(data.audioCodecDist ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([codec, count]) => ({
      codec,
      count,
      filter:
        codec === 'eac3' ? 'ddp'
        : codec === 'truehd' ? 'truehd'
        : codec.startsWith('dts') ? 'dts'
        : codec === 'aac' ? 'aac'
        : codec === 'ac3' ? 'ac3'
        : codec,
    }));

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#f0eeff] flex items-center gap-2">
          <LayoutDashboard size={20} style={{ color: 'var(--c-accent)' }} />
          Dashboard
        </h1>
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
        <div className="relative h-full">
          <Link
            to="/library?reset=1"
            className="absolute inset-0 rounded-xl z-10"
            aria-label="Open library from Movies card"
          />
          <div className="relative z-20 pointer-events-none bg-[#16161f] border border-[#26263a] rounded-xl p-4 h-full min-h-[138px] flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-sm text-[#a78bfa]">
              <Film size={16} />
              <span>Movies</span>
              <span className="ml-auto pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                <InfoHint
                  label="Movies info"
                  text="Curatarr treats one library folder as one movie record. If multiple versions exist in a folder, they appear under that movie as Files (2), Files (3), etc."
                />
              </span>
            </div>
            <div className="text-2xl font-bold text-[#f0eeff]">{data.totalMovies.toLocaleString()}</div>
            <div className="text-xs text-[#6b6888] mt-0.5 min-h-[16px]" />
          </div>
        </div>
        <StatCard
          icon={CheckCircle}
          label="Scanned Files"
          value={`${data.scannedFiles.toLocaleString()} / ${data.totalFiles.toLocaleString()}`}
          sub={lastScanSummary ?? (data.totalFiles > data.scannedFiles ? `${(data.totalFiles - data.scannedFiles).toLocaleString()} pending` : '')}
          subWrap
          color="text-green-400"
          infoText="File-level ffprobe scan coverage. This is per video file, not per movie folder."
        />
        <StatCard
          icon={JellyfinIcon}
          label="Jellyfin Synced"
          value={`${jfPct}%`}
          sub={
            <span className="inline-flex items-center gap-1 text-sm">
              <span className="text-[#d4cfff] font-semibold">{data.jfEnriched}</span>
              <span className="text-[#6b6888]">matched</span>
              <span className="text-[#6b6888]">·</span>
              <span className="text-amber-400 font-semibold">{data.totalMovies - data.jfEnriched}</span>
              <span className="text-[#6b6888]">unmatched</span>
              <span className="text-[#6b6888]">·</span>
              <span className="text-[#6b6888]">{data.totalMovies} total</span>
            </span>
          }
          color="text-cyan-400"
          infoText="Movie-level status. Curatarr maps one folder to one movie; multi-version files stay inside that movie record and are shown in Movie details as Files (2), Files (3), etc."
        />
        <StatCard
          icon={AlertCircle}
          label="Scan Errors"
          value={data.errorFiles}
          color={data.errorFiles > 0 ? 'text-red-400' : 'text-[#6b6888]'}
          infoText="Basic file sanity/metadata scan failures from ffprobe during library scan. This is separate from Disambiguate and Deep Verify errors."
        />
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">Library Views</h2>
      </div>

      {/* Library views quick links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">Video</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center text-sm">
          <Link
            to="/library?hdr=1"
            className="hover:underline inline-flex items-center gap-1"
            title="Show HDR files in Library"
          >
            <span className="text-amber-400 font-semibold">{data.hdrCount}</span>
            <span className="text-[#8b87aa]">HDR</span>
          </Link>
          <span className="text-[#26263a]">·</span>
          <Link
            to="/library?dv=1"
            className="hover:underline inline-flex items-center gap-1"
            title="Show Dolby Vision files in Library"
          >
            <span className="text-amber-400 font-semibold">{data.dolbyVisionCount}</span>
            <span className="text-[#8b87aa]">Dolby Vision</span>
          </Link>
          {(data.codecDist['av1'] ?? 0) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <Link to="/library?av1Compat=1"
                className="hover:underline inline-flex items-center gap-1"
                title="AV1 files may not hardware-decode on Android TV / older sticks — click to view in Library">
                <span className="text-emerald-400 font-semibold">{data.codecDist['av1']}</span>
                <span className="text-[#8b87aa]">AV1</span>
                <span className="text-amber-400 text-xs">⚠ compat</span>
              </Link>
            </>
          )}
          {((data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)) > 0 && (
            <>
              <span className="text-[#26263a]">·</span>
              <Link to="/library?legacy=1"
                className="hover:underline inline-flex items-center gap-1"
                title="Legacy codec — click to filter in Library">
                <span className="text-orange-400 font-semibold">
                  {(data.codecDist['mpeg4'] ?? 0) + (data.codecDist['mpeg2video'] ?? 0)}
                </span>
                <span className="text-[#8b87aa]">legacy codec</span>
              </Link>
            </>
          )}
          </div>
        </div>
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">Audio</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            {audioQuickLinks.length === 0 && (
              <span className="text-[#6b6888]">No audio codec data yet.</span>
            )}
            {audioQuickLinks.map((row) => (
              <Link
                key={row.codec}
                to={`/library?audioFormat=${encodeURIComponent(row.filter)}`}
                className="hover:underline"
                title={`Filter Library by audio codec: ${row.codec}`}
              >
                <span className="text-cyan-400 font-medium">{row.count}</span>
                <span className="text-[#8b87aa]"> {row.codec.toUpperCase()}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">Analytics</h2>
      </div>

      {/* Analytics charts */}
      <div className="space-y-6">
        <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
          <h2 className="text-sm font-medium text-[#8b87aa] mb-3">Resolution Distribution</h2>
          <ResolutionPieChart data={data.resolutionDist} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
            <h2 className="text-sm font-medium text-[#8b87aa] mb-3">Video Codec Distribution</h2>
            <CodecBarChart data={data.codecDist} />
          </div>
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
            <h2 className="text-sm font-medium text-[#8b87aa] mb-3">Audio Codec Distribution</h2>
            <CodecBarChart data={data.audioCodecDist ?? {}} />
          </div>
        </div>
      </div>

      {showScanModal && (
        <ScanProgressModal mode="scan" onClose={() => setShowScanModal(false)} />
      )}
    </div>
  );
}
