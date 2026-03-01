import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Star, AlertTriangle } from 'lucide-react';
import { api, type Candidate } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge } from '../components/QualityBadge.js';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer.js';

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

const LEGACY_CODECS = new Set(['mpeg4', 'mpeg2video', 'msmpeg4v3']);
const AV1_TV_WARN_PROFILES = new Set(['android_tv', 'fire_tv']);

function CompatTag({ codec }: { codec: string | null }) {
  if (!codec) return null;
  const k = codec.toLowerCase();
  const profile = (() => { try { return localStorage.getItem('clientProfile') ?? 'android_tv'; } catch { return 'android_tv'; } })();
  if (k === 'av1' && AV1_TV_WARN_PROFILES.has(profile)) {
    return (
      <span title="AV1 not hardware-decoded on this client" className="inline-flex items-center gap-0.5 text-xs text-amber-400">
        <AlertTriangle size={11} /> AV1 compat
      </span>
    );
  }
  if (LEGACY_CODECS.has(k)) {
    return (
      <span title="Legacy codec — replace recommended" className="inline-flex items-center gap-0.5 text-xs text-orange-400">
        <AlertTriangle size={11} /> legacy
      </span>
    );
  }
  return null;
}

export function ScoutQueue() {
  // Load seeded defaults from settings API
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    staleTime: 60_000,
  });

  const settings = settingsData?.settings ?? {};
  const seedMinCritic = parseFloat(settings.scoutMinCritic ?? '65');
  const seedMinComm = parseFloat(settings.scoutMinCommunity ?? '7.0');
  const seedMaxRes = settings.scoutMaxResolution ?? '1080p';

  const [minCritic, setMinCritic] = useState<number | null>(null);
  const [minCommunity, setMinCommunity] = useState<number | null>(null);
  const [maxRes, setMaxRes] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | undefined>();

  // Resolved values (state overrides seeded defaults)
  const effMinCritic = minCritic ?? seedMinCritic;
  const effMinComm = minCommunity ?? seedMinComm;
  const effMaxRes = maxRes ?? seedMaxRes;

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', effMinCritic, effMinComm, effMaxRes],
    queryFn: () => api.candidates({
      minCritic: effMinCritic,
      minCommunity: effMinComm,
      maxResolution: effMaxRes,
      limit: 200,
    }),
    enabled: !isNaN(effMinCritic) && !isNaN(effMinComm),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="px-6 py-3 border-b flex items-center gap-4 shrink-0"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
        <h1 className="font-semibold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
          <TrendingUp size={17} style={{ color: 'var(--c-accent)' }} />
          Scout Queue
        </h1>

        <div className="flex items-center gap-2 ml-4 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Min MC</label>
          <input
            type="number" min={0} max={100}
            value={effMinCritic}
            onChange={e => setMinCritic(Number(e.target.value))}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Min IMDb</label>
          <input
            type="number" min={0} max={10} step={0.1}
            value={effMinComm}
            onChange={e => setMinCommunity(Number(e.target.value))}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Max res</label>
          <select
            value={effMaxRes}
            onChange={e => setMaxRes(e.target.value)}
            className="px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        {/* Reset to seeded defaults */}
        {(minCritic !== null || minCommunity !== null || maxRes !== null) && (
          <button
            onClick={() => { setMinCritic(null); setMinCommunity(null); setMaxRes(null); }}
            className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--c-muted)', background: 'var(--c-border)' }}
          >
            Reset defaults
          </button>
        )}

        <span className="ml-auto text-xs" style={{ color: 'var(--c-muted)' }}>
          {data ? `${data.total} candidates` : '…'}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8" style={{ color: 'var(--c-muted)' }}>Loading…</div>
        ) : !data?.candidates.length ? (
          <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>
            No upgrade candidates with current filters.
            <br />
            <span className="text-xs">Adjust Min MC / Min IMDb or extend Max res.</span>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider sticky top-0"
                style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">HDR</th>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2 text-right">MC</th>
                <th className="px-3 py-2 text-right">IMDb</th>
                <th className="px-3 py-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {data.candidates.map((c: Candidate) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(38,38,58,0.6)',
                    background: selectedId === c.id ? 'rgba(124,58,237,0.12)' : undefined,
                  }}
                  onMouseEnter={e => { if (selectedId !== c.id) (e.currentTarget as HTMLElement).style.background = 'rgba(22,22,31,0.8)'; }}
                  onMouseLeave={e => { if (selectedId !== c.id) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1 font-bold text-base text-amber-400">
                      <Star size={12} />
                      {c.priority_score}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <span className="truncate block font-medium" style={{ color: 'var(--c-text)' }}>
                      {c.jellyfin_title ?? c.parsed_title ?? c.folder_name}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-muted)' }}>{c.parsed_year ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex gap-1">
                      <ResolutionBadge resolution={c.resolution_cat} />
                      <CodecBadge codec={c.video_codec} showCompatWarning />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <HdrBadge hdrFormats={c.hdr_formats} dvProfile={c.dv_profile} />
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--c-muted)' }}>
                    {c.release_group ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <CompatTag codec={c.video_codec} />
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: '#c4b5fd' }}>
                    {c.critic_rating ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: '#c4b5fd' }}>
                    {c.community_rating?.toFixed(1) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs" style={{ color: 'var(--c-muted)' }}>
                    {fmtSize(c.file_size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <MovieDetailDrawer movieId={selectedId} onClose={() => setSelectedId(undefined)} />
      )}
    </div>
  );
}
