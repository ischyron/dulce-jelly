import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { TrendingUp, Star, AlertTriangle, X } from 'lucide-react';
import { api, type Candidate } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, CriticScoreBadge } from '../components/QualityBadge.js';
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

function fileNameFromPath(filePath: string | null): string {
  if (!filePath) return '—';
  const parts = filePath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

function clampBatchSize(raw: string | undefined): number {
  const n = parseInt(raw ?? '10', 10);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(10, n));
}

export function ScoutQueue() {
  const [searchParams, setSearchParams] = useSearchParams();

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
  const seedGenre = '';
  const maxBatch = clampBatchSize(settings.scoutSearchBatchSize);

  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [selectedBatch, setSelectedBatch] = useState<number[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchUiError, setBatchUiError] = useState<string>('');
  const [batchResultMsg, setBatchResultMsg] = useState<string>('');

  const qMinCritic = searchParams.get('minCritic');
  const qMinCommunity = searchParams.get('minCommunity');
  const qMaxRes = searchParams.get('maxRes');
  const qGenre = searchParams.get('genre');

  // Resolved values (URL overrides seeded defaults)
  const effMinCritic = qMinCritic != null ? Number(qMinCritic) : seedMinCritic;
  const effMinComm = qMinCommunity != null ? Number(qMinCommunity) : seedMinComm;
  const effMaxRes = qMaxRes ?? seedMaxRes;
  const effGenre = qGenre ?? seedGenre;

  function patch(changes: Record<string, string | null>) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }

  const { data: genresData } = useQuery({
    queryKey: ['genres'],
    queryFn: api.genres,
    staleTime: 120_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['candidates', effMinCritic, effMinComm, effMaxRes, effGenre],
    queryFn: () => api.candidates({
      minCritic: effMinCritic,
      minCommunity: effMinComm,
      maxResolution: effMaxRes,
      ...(effGenre ? { genre: effGenre } : {}),
      limit: 200,
    }),
    enabled: Number.isFinite(effMinCritic) && Number.isFinite(effMinComm),
  });

  const candidateById = useMemo(() => {
    const map = new Map<number, Candidate>();
    for (const c of data?.candidates ?? []) map.set(c.id, c);
    return map;
  }, [data?.candidates]);

  const selectedRows = selectedBatch
    .map(id => candidateById.get(id))
    .filter((v): v is Candidate => Boolean(v))
    .slice(0, 10);

  const batchMutation = useMutation({
    mutationFn: (movieIds: number[]) => api.scoutSearchBatch({ movieIds, batchSize: movieIds.length }),
    onSuccess: (res) => {
      const errors = res.results.filter(r => r.error).length;
      setBatchResultMsg(`Batch scout complete: ${res.processed} processed${errors ? `, ${errors} errors` : ''}.`);
      setShowBatchModal(false);
      setSelectedBatch([]);
      setBatchUiError('');
    },
    onError: (err) => {
      setBatchUiError((err as Error).message);
    },
  });

  function toggleRowSelection(movieId: number, checked: boolean) {
    setBatchUiError('');
    setBatchResultMsg('');
    setSelectedBatch(prev => {
      if (!checked) return prev.filter(id => id !== movieId);
      if (prev.includes(movieId)) return prev;
      if (prev.length >= maxBatch) {
        setBatchUiError(`Max batch size reached (${maxBatch}).`);
        return prev;
      }
      return [...prev, movieId];
    });
  }

  function openBatchModal() {
    if (selectedBatch.length === 0) return;
    setShowBatchModal(true);
  }

  function confirmScoutBatch() {
    if (selectedBatch.length === 0) return;
    const capped = selectedBatch.slice(0, maxBatch);
    batchMutation.mutate(capped);
  }

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
            onChange={e => patch({ minCritic: e.target.value })}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Min IMDb</label>
          <input
            type="number" min={0} max={10} step={0.1}
            value={effMinComm}
            onChange={e => patch({ minCommunity: e.target.value })}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Max res</label>
          <select
            value={effMaxRes}
            onChange={e => patch({ maxRes: e.target.value })}
            className="px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label style={{ color: 'var(--c-muted)' }}>Genre</label>
          <select
            value={effGenre}
            onChange={e => patch({ genre: e.target.value || null })}
            className="px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: effGenre ? 'var(--c-accent)' : 'var(--c-muted)' }}
          >
            <option value="">All</option>
            {(genresData?.genres ?? []).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Reset to seeded defaults */}
        {(qMinCritic !== null || qMinCommunity !== null || qMaxRes !== null || qGenre !== null) && (
          <button
            onClick={() => patch({ minCritic: null, minCommunity: null, maxRes: null, genre: null })}
            className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--c-muted)', background: 'var(--c-border)' }}
          >
            Reset defaults
          </button>
        )}

        {selectedBatch.length > 0 && (
          <button
            onClick={openBatchModal}
            className="text-xs px-3 py-1 rounded font-medium"
            style={{ background: 'var(--c-accent)', color: 'white' }}
          >
            Scout Batch
          </button>
        )}

        <span className="ml-auto text-xs" style={{ color: 'var(--c-muted)' }}>
          {data ? `${data.total} candidates` : '…'} · {selectedBatch.length}/{maxBatch} selected
        </span>
      </div>
      {(batchUiError || batchResultMsg) && (
        <div className="px-6 py-2 text-xs" style={{ color: batchUiError ? '#f87171' : '#8b87aa' }}>
          {batchUiError || batchResultMsg}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8" style={{ color: 'var(--c-muted)' }}>Loading…</div>
        ) : !data?.candidates.length ? (
          <div className="p-8 space-y-1" style={{ color: 'var(--c-muted)' }}>
            <p className="text-sm">No upgrade candidates with current filters.</p>
            <p className="text-xs">
              Scout Queue requires Metacritic and IMDb ratings — these come from{' '}
              <strong style={{ color: 'var(--c-text)' }}>Jellyfin Sync</strong> (Scan &amp; Sync page).
              If you haven't synced yet, all ratings are null and no movies will appear here.
              Try setting Min MC and Min IMDb to 0 to see all scanned movies regardless of ratings.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider sticky top-0"
                style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
                <th className="px-3 py-2" aria-label="Select rows" />
                <th className="px-3 py-2"
                  title="Priority score = round((CriticRating * 0.4) + (IMDbRating * 6)). Higher means better upgrade candidate.">
                  Score
                </th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">HDR</th>
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    Group
                    <span
                      className="text-[10px] font-semibold normal-case tracking-normal"
                      style={{ color: 'var(--c-border)' }}
                      title="Torrent/Usenet release group inferred from the filename only."
                      aria-label="Group info"
                    >
                      [i]
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2 text-right"
                  title="Critic score (0–100) from Jellyfin CriticRating. Red = Fresh (≥60), grey = Rotten (<60). Source depends on Jellyfin metadata plugin.">
                  <span className="inline-flex items-center gap-1">
                    Critic
                    <span
                      className="text-[10px] font-semibold normal-case tracking-normal"
                      style={{ color: 'var(--c-border)' }}
                      title="Critic scoring source currently configured for your library metadata (for example IMDb or your custom setup)."
                      aria-label="Critic info"
                    >
                      [i]
                    </span>
                  </span>
                </th>
                <th className="px-3 py-2 text-right"
                  title="IMDb community rating (0–10) from Jellyfin CommunityRating">IMDb</th>
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
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                      style={{ minWidth: 28, minHeight: 28 }}>
                      <input
                        type="checkbox"
                        checked={selectedBatch.includes(c.id)}
                        onChange={e => toggleRowSelection(c.id, e.target.checked)}
                        aria-label={`Select ${c.jellyfin_title ?? c.parsed_title ?? c.folder_name}`}
                        className="w-5 h-5 cursor-pointer"
                      />
                    </label>
                  </td>
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
                  <td className="px-3 py-2 text-right">
                    <CriticScoreBadge score={c.critic_rating} />
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
        <MovieDetailDrawer
          movieId={selectedId}
          onClose={() => setSelectedId(undefined)}
          enableScoutSearch
        />
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-xl border p-4"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                Scout Batch Confirmation
              </h2>
              <button onClick={() => setShowBatchModal(false)} style={{ color: 'var(--c-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: 'var(--c-muted)' }}>
              Confirm scouting these titles. Based on current settings and downstream rules, selected titles may be recycled/replaced after approval flow.
            </p>

            <div className="max-h-80 overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Current Filename</th>
                    <th className="px-3 py-2 text-left">Current Path</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid rgba(38,38,58,0.7)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                        {row.jellyfin_title ?? row.parsed_title ?? row.folder_name}
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: '#d4cfff' }}>
                        {fileNameFromPath(row.file_file_path)}
                      </td>
                      <td className="px-3 py-2 font-mono break-all" style={{ color: 'var(--c-muted)' }}>
                        {row.file_file_path}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                Showing {selectedRows.length} / {maxBatch} selected (hard max 10).
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="px-3 py-1.5 rounded text-xs"
                  style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmScoutBatch}
                  disabled={batchMutation.isPending}
                  className="px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-60"
                  style={{ background: 'var(--c-accent)' }}
                >
                  {batchMutation.isPending ? 'Running…' : 'Confirm Scout Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
