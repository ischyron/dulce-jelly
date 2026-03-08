import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Film, LayoutDashboard, Loader2, Rocket, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { CodecBarChart, ResolutionPieChart } from '../components/Charts';
import { InfoHint } from '../components/InfoHint';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/dashboard/StatCard';
import { JellyfinIcon } from '../components/shared/icons/index';
import { ScanProgressModal } from '../components/shared/modals';
import { formatSyncDate } from '../components/shared/utils';

export function Dashboard() {
  const { t } = useTranslation('dashboard');
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
    return <div className="p-8 text-[#8b87aa]">{t('loading')}</div>;
  }
  if (error || !data) {
    return <div className="p-8 text-red-400">{t('error')}</div>;
  }

  const jellyfinSyncPercentage = data.totalMovies > 0 ? Math.round((data.jfEnriched / data.totalMovies) * 100) : 0;

  const lastScan = data.lastScan as Record<string, unknown> | undefined;
  const lastScanSummary = lastScan ? (
    <div className="space-y-0.5 leading-5">
      <div>
        Last scan: {formatSyncDate(String(lastScan.started_at ?? '—'))} ({Number(lastScan.duration_sec ?? 0).toFixed(0)}
        s)
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
        codec === 'eac3'
          ? 'ddp'
          : codec === 'truehd'
            ? 'truehd'
            : codec.startsWith('dts')
              ? 'dts'
              : codec === 'aac'
                ? 'aac'
                : codec === 'ac3'
                  ? 'ac3'
                  : codec,
    }));

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={LayoutDashboard} title={t('pageTitle')}>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={triggerDashboardScan}
            disabled={scanLaunching}
            className="flex items-center gap-2 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {scanLaunching ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t('starting')}
              </>
            ) : (
              <>
                <ScanLine size={16} /> {t('scanLibrary')}
              </>
            )}
          </button>
          {scanError && <p className="text-xs text-red-400 max-w-xs text-right">{scanError}</p>}
        </div>
      </PageHeader>
      <div className="px-6 py-6 space-y-6 max-w-6xl">
        {/* Onboarding banner for fresh installs */}
        {data.totalMovies === 0 && (
          <div className="bg-[#1a1030] border border-[#7c3aed]/40 rounded-xl p-5 flex gap-4 items-start">
            <Rocket size={22} className="text-[#a78bfa] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#d4cfff]">{t('onboarding.title')}</p>
              <p className="text-sm text-[#8b87aa]">{t('onboarding.subtitle')}</p>
              <ol className="text-sm text-[#8b87aa] list-decimal list-inside space-y-0.5 mt-1">
                <li>
                  {t('onboarding.step1Prefix')}
                  <Link to="/settings" className="text-[#a78bfa] hover:underline">
                    {t('onboarding.step1Link')}
                  </Link>
                  {t('onboarding.step1Suffix')}
                </li>
                <li>
                  {t('onboarding.step2Prefix')}
                  <strong className="text-[#c4b5fd]">{t('onboarding.step2Action')}</strong>
                  {t('onboarding.step2Suffix')}
                </li>
                <li>
                  {t('onboarding.step3Prefix')}
                  <Link to="/scan" className="text-[#a78bfa] hover:underline">
                    {t('onboarding.step3Link')}
                  </Link>
                  {t('onboarding.step3Suffix')}
                </li>
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
                <span>{t('stats.movies')}</span>
                <span
                  className="pointer-events-auto"
                  role="presentation"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <InfoHint
                    label="Movies info"
                    text="Curatarr treats one library folder as one movie record. If multiple versions exist in a folder, they appear under that movie as Files (2), Files (3), etc."
                  />
                </span>
              </div>
              <div className="text-2xl font-bold text-[#f0eeff]">{data.totalMovies.toLocaleString()}</div>
              <div className="text-xs text-[#8b87aa] mt-0.5 min-h-[16px]" />
            </div>
          </div>
          <StatCard
            icon={CheckCircle}
            label={t('stats.scannedFiles')}
            value={`${data.scannedFiles.toLocaleString()} / ${data.totalFiles.toLocaleString()}`}
            sub={
              lastScanSummary ??
              (data.totalFiles > data.scannedFiles
                ? `${(data.totalFiles - data.scannedFiles).toLocaleString()} pending`
                : '')
            }
            subWrap
            color="text-green-400"
            infoText={t('stats.scannedFilesHint')}
          />
          <StatCard
            icon={JellyfinIcon}
            label={t('stats.jellyfinSynced')}
            value={`${jellyfinSyncPercentage}%`}
            sub={
              <span className="inline-flex items-center gap-1 text-sm">
                <span className="text-[#d4cfff] font-semibold">{data.jfEnriched}</span>
                <span className="text-[#8b87aa]">{t('stats.matched')}</span>
                <span className="text-[#8b87aa]">·</span>
                <span className="text-amber-400 font-semibold">{data.totalMovies - data.jfEnriched}</span>
                <span className="text-[#8b87aa]">{t('stats.unmatched')}</span>
                <span className="text-[#8b87aa]">·</span>
                <span className="text-[#8b87aa]">
                  {data.totalMovies} {t('stats.total')}
                </span>
              </span>
            }
            color="text-cyan-400"
            infoText={t('stats.jellyfinSyncedHint')}
          />
          <StatCard
            icon={AlertCircle}
            label={t('stats.scanErrors')}
            value={data.errorFiles}
            color={data.errorFiles > 0 ? 'text-red-400' : 'text-[#8b87aa]'}
            infoText={t('stats.scanErrorsHint')}
          />
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">{t('views.title')}</h2>
        </div>

        {/* Library views quick links */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">{t('views.video')}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center text-sm">
              <Link
                to="/library?hdr=1"
                className="hover:underline inline-flex items-center gap-1"
                title="Show HDR files in Library"
              >
                <span className="text-amber-400 font-semibold">{data.hdrCount}</span>
                <span className="text-[#8b87aa]">{t('views.hdr')}</span>
              </Link>
              <span className="text-[#26263a]">·</span>
              <Link
                to="/library?dv=1"
                className="hover:underline inline-flex items-center gap-1"
                title="Show Dolby Vision files in Library"
              >
                <span className="text-amber-400 font-semibold">{data.dolbyVisionCount}</span>
                <span className="text-[#8b87aa]">{t('views.dolbyVision')}</span>
              </Link>
              {(data.codecDist.av1 ?? 0) > 0 && (
                <>
                  <span className="text-[#26263a]">·</span>
                  <Link
                    to="/library?av1Compat=1"
                    className="hover:underline inline-flex items-center gap-1"
                    title="AV1 files may not hardware-decode on Android TV / older sticks — click to view in Library"
                  >
                    <span className="text-emerald-400 font-semibold">{data.codecDist.av1}</span>
                    <span className="text-[#8b87aa]">{t('views.av1')}</span>
                    <span className="text-amber-400 text-xs">{t('views.av1Compat')}</span>
                  </Link>
                </>
              )}
              {(data.codecDist.mpeg4 ?? 0) + (data.codecDist.mpeg2video ?? 0) > 0 && (
                <>
                  <span className="text-[#26263a]">·</span>
                  <Link
                    to="/library?legacy=1"
                    className="hover:underline inline-flex items-center gap-1"
                    title="Legacy codec — click to filter in Library"
                  >
                    <span className="text-orange-400 font-semibold">
                      {(data.codecDist.mpeg4 ?? 0) + (data.codecDist.mpeg2video ?? 0)}
                    </span>
                    <span className="text-[#8b87aa]">{t('views.legacyCodec')}</span>
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">{t('views.audio')}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
              {audioQuickLinks.length === 0 && <span className="text-[#8b87aa]">{t('views.noAudioData')}</span>}
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] mb-2">{t('analytics.title')}</h2>
        </div>

        {/* Analytics charts */}
        <div className="space-y-6">
          <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
            <h2 className="text-sm font-medium text-[#8b87aa] mb-3">{t('analytics.resolutionDist')}</h2>
            <ResolutionPieChart data={data.resolutionDist} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
              <h2 className="text-sm font-medium text-[#8b87aa] mb-3">{t('analytics.videoCodecDist')}</h2>
              <CodecBarChart data={data.codecDist} />
            </div>
            <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4">
              <h2 className="text-sm font-medium text-[#8b87aa] mb-3">{t('analytics.audioCodecDist')}</h2>
              <CodecBarChart data={data.audioCodecDist ?? {}} label={t('analytics.audioCodecDist')} />
            </div>
          </div>
        </div>

        {showScanModal && <ScanProgressModal mode="scan" onClose={() => setShowScanModal(false)} />}
      </div>
    </div>
  );
}
