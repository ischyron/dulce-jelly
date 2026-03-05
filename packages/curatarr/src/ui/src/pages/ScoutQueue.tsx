import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Star, AlertTriangle, X } from 'lucide-react';
import { api, type Candidate } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, CriticScoreBadge } from '../components/QualityBadge.js';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer.js';
import { InfoHint } from '../components/InfoHint.js';

function formatSize(bytes: number | null): string {
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
  const seedGenre = '';
  const maxBatch = clampBatchSize(settings.scoutSearchBatchSize);

  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [selectedBatch, setSelectedBatch] = useState<number[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchUiError, setBatchUiError] = useState<string>('');
  const [batchResultMsg, setBatchResultMsg] = useState<string>('');

  const qMinCritic = searchParams.get('minCritic');
  const qMinCommunity = searchParams.get('minCommunity');
  const qGenre = searchParams.get('genre');

  // Resolved values (URL overrides seeded defaults)
  const effMinCritic = qMinCritic != null ? Number(qMinCritic) : seedMinCritic;
  const effMinComm = qMinCommunity != null ? Number(qMinCommunity) : seedMinComm;
  const effGenre = qGenre ?? seedGenre;
  const selectedGenres = effGenre ? effGenre.split(',').map(g => g.trim()).filter(Boolean) : [];
  const genreRef = useRef<HTMLDivElement | null>(null);
  const [genreOpen, setGenreOpen] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!genreRef.current) return;
      if (!genreRef.current.contains(e.target as Node)) setGenreOpen(false);
    }
    if (genreOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [genreOpen]);

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

  const genreKey = selectedGenres.join(',');
  const { data, isLoading } = useQuery({
    queryKey: ['candidates', effMinCritic, effMinComm, genreKey],
    queryFn: () => api.candidates({
      minCritic: effMinCritic,
      minCommunity: effMinComm,
      ...(selectedGenres.length > 0 ? { genre: selectedGenres.join(',') } : {}),
      limit: 200,
    }),
    enabled: Number.isFinite(effMinCritic) && Number.isFinite(effMinComm),
  });

  function removeGenreFilter(genre: string) {
    const next = selectedGenres.filter(g => g !== genre);
    patch({ genre: next.length > 0 ? next.join(',') : null });
  }

  function toggleGenreFilter(genre: string) {
    const g = genre.trim();
    if (!g) return;
    if (selectedGenres.includes(g)) {
      removeGenreFilter(g);
      return;
    }
    patch({ genre: [...selectedGenres, g].join(',') });
  }

  const candidateById = useMemo(() => {
    const map = new Map<number, Candidate>();
    for (const c of data?.candidates ?? []) map.set(c.id, c);
    return map;
  }, [data?.candidates]);

  const selectedRows = selectedBatch
    .map(id => candidateById.get(id))
    .filter((v): v is Candidate => Boolean(v))
    .slice(0, 10);
  const pageCandidateIds = data?.candidates.map((c: Candidate) => c.id) ?? [];
  const allPageSelected = pageCandidateIds.length > 0 && pageCandidateIds.every(id => selectedBatch.includes(id));

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

  function toggleSelectAllOnPage(checked: boolean) {
    setBatchUiError('');
    setBatchResultMsg('');
    setSelectedBatch(prev => {
      if (checked) {
        const merged = Array.from(new Set([...prev, ...pageCandidateIds]));
        if (merged.length > maxBatch) {
          setBatchUiError(`Max batch size reached (${maxBatch}).`);
          return merged.slice(0, maxBatch);
        }
        return merged;
      }
      return prev.filter(id => !pageCandidateIds.includes(id));
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="px-6 py-3 border-b flex items-center gap-4 shrink-0"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
        <h1 className="font-semibold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
          <Bot size={17} style={{ color: 'var(--c-accent)' }} />
          Scout Queue
        </h1>

        <div ref={genreRef} className="relative flex items-center gap-2 text-sm ml-4">
          <label
            className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border"
            style={{ color: '#93c5fd', borderColor: 'rgba(147,197,253,0.35)', background: 'rgba(147,197,253,0.12)' }}
          >
            Genre
          </label>
          <button
            onClick={() => setGenreOpen(v => !v)}
            className="px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: selectedGenres.length > 0 ? 'var(--c-accent)' : 'var(--c-muted)' }}
          >
            {selectedGenres.length > 0 ? `${selectedGenres.length} selected` : 'Select genres'}
          </button>
          {genreOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              {(genresData?.genres ?? []).length === 0 && (
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>No genres available.</div>
              )}
              {(genresData?.genres ?? []).map(g => (
                <label key={g} className="flex items-center gap-2 text-xs cursor-pointer"
                  style={{ color: selectedGenres.includes(g) ? '#d4cfff' : 'var(--c-muted)' }}>
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(g)}
                    onChange={() => toggleGenreFilter(g)}
                    className="accent-violet-600"
                  />
                  <span>{g}</span>
                </label>
              ))}
            </div>
          )}
          {selectedGenres.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedGenres.map(g => (
                <button
                  key={g}
                  onClick={() => removeGenreFilter(g)}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{ color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }}
                  title="Remove genre filter"
                >
                  {g} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-4 text-sm">
          <label
            className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border"
            style={{ color: '#93c5fd', borderColor: 'rgba(147,197,253,0.35)', background: 'rgba(147,197,253,0.12)' }}
          >
            Min MC
          </label>
          <input
            type="number" min={0} max={100}
            value={effMinCritic}
            onChange={e => patch({ minCritic: e.target.value })}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label
            className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border"
            style={{ color: '#93c5fd', borderColor: 'rgba(147,197,253,0.35)', background: 'rgba(147,197,253,0.12)' }}
          >
            Min IMDb
          </label>
          <input
            type="number" min={0} max={10} step={0.1}
            value={effMinComm}
            onChange={e => patch({ minCommunity: e.target.value })}
            className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        {/* Reset to seeded defaults */}
        {(qMinCritic !== null || qMinCommunity !== null || qGenre !== null) && (
          <button
            onClick={() => patch({ minCritic: null, minCommunity: null, genre: null })}
            className="text-xs px-2 py-1 rounded border font-semibold"
            style={{ color: '#ddd6fe', borderColor: 'rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.2)' }}
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
                <th className="px-2 py-2 text-center" style={{ width: '32px' }}>
                  <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                    style={{ minWidth: 28, minHeight: 28 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={e => toggleSelectAllOnPage(e.target.checked)}
                      className="w-5 h-5 accent-violet-600 cursor-pointer"
                      title="Select all rows on this page"
                    />
                  </label>
                </th>
                <th className="px-3 py-2"
                  title="Priority score = round((CriticRating * 0.4) + (IMDbRating * 6)). Higher means better upgrade candidate.">
                  <span className="inline-flex items-center gap-1">
                    Score
                    <InfoHint
                      label="Scout score info"
                      text="Scout queue candidate score uses library priority logic: round((CriticRating * 0.4) + (IMDbRating * 6)). Release CF scoring rules are configurable in Settings → CF Scoring, Rules, Scout."
                    />
                  </span>
                </th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Quality</th>
                <th className="px-3 py-2">HDR</th>
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    Group
                    <InfoHint
                      label="Group info"
                      text="Torrent/Usenet release group inferred from the filename only."
                    />
                  </span>
                </th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2 text-right"
                  title="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin. Red = Fresh (≥60), grey = Rotten (<60).">
                  <span className="inline-flex items-center gap-1">
                    Critic
                    <InfoHint
                      label="Critic info"
                      text="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin."
                    />
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
                  className="transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(38,38,58,0.6)',
                    background: selectedId === c.id ? 'rgba(124,58,237,0.12)' : undefined,
                  }}
                >
                  <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                    <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                      style={{ minWidth: 28, minHeight: 28 }}>
                      <input
                        type="checkbox"
                        checked={selectedBatch.includes(c.id)}
                        onChange={e => toggleRowSelection(c.id, e.target.checked)}
                        aria-label={`Select ${c.jellyfin_title ?? c.parsed_title ?? c.folder_name}`}
                        className="w-5 h-5 accent-violet-600 cursor-pointer"
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
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className="truncate block font-medium text-left w-full hover:underline cursor-pointer"
                      style={{ color: 'var(--c-text)' }}
                    >
                      {c.jellyfin_title ?? c.parsed_title ?? c.folder_name}
                    </button>
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
                    {formatSize(c.file_size)}
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
