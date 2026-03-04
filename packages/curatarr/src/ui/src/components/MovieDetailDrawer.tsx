import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Film, Star, ExternalLink, Search, Loader2, AlertCircle, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type FileRow, type ScoutRelease } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, CriticScoreBadge } from './QualityBadge.js';

interface Props {
  movieId: number;
  onClose: () => void;
  enableScoutSearch?: boolean;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

function fmtAge(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const ms = Date.now() - d.getTime();
  if (ms < 0) return '0d';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(ms / (1000 * 60));
  return `${Math.max(1, mins)}m`;
}

function fmtReleaseSize(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function FileCard({ file }: { file: FileRow }) {
  const audioTracks: { codec: string; channels: number; language: string }[] =
    file.audio_tracks ? JSON.parse(file.audio_tracks) : [];
  const subtitles: string[] = file.subtitle_langs ? JSON.parse(file.subtitle_langs) : [];

  return (
    <div className="bg-[#1e1e2e]/60 border border-[#26263a] rounded-lg p-3 space-y-2 text-sm">
      <div className="font-mono text-xs text-[#8b87aa] whitespace-normal break-all leading-5" title={file.filename}>
        {file.filename}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <ResolutionBadge resolution={file.resolution_cat} />
        <CodecBadge codec={file.video_codec} />
        <HdrBadge hdrFormats={file.hdr_formats} dvProfile={file.dv_profile} />
        {file.bit_depth && file.bit_depth > 8 && (
          <span className="px-1.5 py-0.5 text-xs font-mono rounded border bg-gray-700/50 text-[#8b87aa] border-gray-600">
            {file.bit_depth}-bit
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#8b87aa]">
        <span>Size: <span className="text-[#d4cfff]">{fmtSize(file.file_size)}</span></span>
        <span>Duration: <span className="text-[#d4cfff]">{fmtDuration(file.duration)}</span></span>
        <span>MB/min: <span className="text-[#d4cfff]">{file.mb_per_minute?.toFixed(1) ?? '—'}</span></span>
        <span>Container: <span className="text-[#d4cfff] uppercase">{file.container ?? '—'}</span></span>
        {file.release_group && (
          <span>Group: <span className="text-[#d4cfff]">{file.release_group}</span></span>
        )}
        {file.audio_profile && (
          <span>Audio: <span className="text-[#d4cfff]">{file.audio_profile}</span></span>
        )}
      </div>
      {audioTracks.length > 1 && (
        <div className="text-xs text-[#6b6888]">
          Tracks: {audioTracks.map(t => `${t.codec} ${t.channels}ch${t.language ? ` [${t.language}]` : ''}`).join(', ')}
        </div>
      )}
      {subtitles.length > 0 && (
        <div className="text-xs text-[#6b6888]">
          Subs: {subtitles.join(', ')}
        </div>
      )}
      {file.scan_error && (
        <div className="text-xs text-red-400">Error: {file.scan_error}</div>
      )}
    </div>
  );
}

function ScoutResultsTable({ releases }: { releases: ScoutRelease[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-[#26263a]">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: '#1e1e2e', color: '#8b87aa' }}>
            <th className="px-2 py-2 text-left">Score</th>
            <th className="px-2 py-2 text-left">Release</th>
            <th className="px-2 py-2 text-left">Indexer</th>
            <th className="px-2 py-2 text-left">Proto</th>
            <th className="px-2 py-2 text-right">Size</th>
            <th className="px-2 py-2 text-right">Age</th>
            <th className="px-2 py-2 text-right">S/P</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r, i) => (
            <tr key={`${r.guid ?? r.title}-${i}`} style={{ borderTop: '1px solid rgba(38,38,58,0.8)' }}>
              <td className="px-2 py-1.5 font-semibold text-amber-400">{r.score}</td>
              <td className="px-2 py-1.5">
                <div className="truncate text-[#d4cfff]" title={r.title}>{r.title}</div>
                {r.reasons.length > 0 && (
                  <div className="text-[10px] text-[#6b6888] truncate">{r.reasons.join(', ')}</div>
                )}
              </td>
              <td className="px-2 py-1.5 text-[#8b87aa]">{r.indexer ?? '—'}</td>
              <td className="px-2 py-1.5 uppercase text-[#8b87aa]">{r.protocol}</td>
              <td className="px-2 py-1.5 text-right text-[#8b87aa]">{fmtReleaseSize(r.size)}</td>
              <td className="px-2 py-1.5 text-right text-[#8b87aa]">{fmtAge(r.publishDate)}</td>
              <td className="px-2 py-1.5 text-right text-[#8b87aa]">
                {(r.seeders ?? 0)}/{(r.peers ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovieDetailDrawer({ movieId, onClose, enableScoutSearch = false }: Props) {
  const queryClient = useQueryClient();
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
    staleTime: 60_000,
  });
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: api.tags,
    staleTime: 60_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['movie', movieId],
    queryFn: () => api.movie(movieId),
  });
  const [selectedTag, setSelectedTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const patchMutation = useMutation({
    mutationFn: (meta: { tags?: string[] }) => api.patchMovie(movieId, meta),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      await queryClient.invalidateQueries({ queryKey: ['movies'] });
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });
  const scoutSearch = useMutation({
    mutationFn: () => api.scoutSearchOne({ movieId }),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const genres: string[] = data?.genres ? JSON.parse(data.genres) : [];
  const tags: string[] = data?.tags ? JSON.parse(data.tags) : [];
  const availableTags = useMemo(
    () => (tagsData?.tags ?? []).filter(t => !tags.includes(t)),
    [tagsData?.tags, tags]
  );
  const addableTag = normalizeTag(newTag);
  const jellyfinBase = (settingsData?.settings.jellyfinPublicUrl ?? '').replace(/\/+$/, '');
  const jellyfinDeepLink = data?.jellyfin_id && jellyfinBase
    ? `${jellyfinBase}/web/#/details?id=${data.jellyfin_id}`
    : undefined;
  const imdbLink = data?.imdb_id ? `https://www.imdb.com/title/${data.imdb_id}/` : undefined;
  const tmdbId = data?.tmdb_id?.match(/\d+/)?.[0] ?? '';
  const tmdbLink = tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : undefined;

  function addExistingTag() {
    const t = normalizeTag(selectedTag);
    if (!t || tags.includes(t)) return;
    patchMutation.mutate({ tags: [...tags, t] });
    setSelectedTag('');
  }

  function addNewTag() {
    if (!addableTag || tags.includes(addableTag)) {
      setNewTag('');
      return;
    }
    patchMutation.mutate({ tags: [...tags, addableTag] });
    setNewTag('');
  }

  function removeTag(tag: string) {
    patchMutation.mutate({ tags: tags.filter(t => t !== tag) });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside className="relative z-10 w-[624px] max-w-full bg-[#16161f] border-l border-[#26263a] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#26263a]">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Film size={16} className="text-[#a78bfa]" />
            Movie Detail
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/movies/${movieId}`}
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: '#a78bfa' }}
              title="Open full page">
              <ExternalLink size={13} />
            </Link>
            <button onClick={onClose} className="text-[#8b87aa] hover:text-[#f0eeff]">
              <X size={18} />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-[#6b6888]">Loading…</div>
        )}

        {data && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Title + Poster */}
            <div className="flex gap-3">
              {data.jellyfin_id && (
                <img
                  src={`/api/proxy/image/${data.jellyfin_id}`}
                  alt="Poster"
                  className="rounded-lg object-cover shrink-0"
                  style={{ width: 80, height: 120 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-[#f0eeff]">
                  {data.jellyfin_title ?? data.parsed_title ?? data.folder_name}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-[#8b87aa]">
                  <span>{data.parsed_year ?? '—'}</span>
                  {data.critic_rating != null && (
                    <CriticScoreBadge score={data.critic_rating} />
                  )}
                  {data.community_rating != null && (
                    <span className="flex items-center gap-1">
                      <Star size={12} />
                      {data.community_rating.toFixed(1)}
                    </span>
                  )}
                </div>
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {genres.map(g => (
                      <span key={g} className="px-2 py-0.5 text-xs bg-[#1e1e2e] text-[#8b87aa] rounded">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
                {data.jf_synced_at && (
                  <div className="mt-2 text-xs">
                    <span className="text-[#6b6888]">Jellyfin Synced:</span>{' '}
                    <span className="font-semibold text-[#d4cfff]">{fmtSyncDate(data.jf_synced_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* External Links */}
            <div className="flex flex-wrap gap-2 text-xs text-[#6b6888]">
              {jellyfinDeepLink && (
                <a href={jellyfinDeepLink} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded border hover:opacity-90"
                  style={{ color: '#c4b5fd', borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
                  <img src="/icons/jellyfin.svg" alt="Jellyfin" className="w-5 h-5" />
                  Jellyfin
                </a>
              )}
              {imdbLink && (
                <a href={imdbLink} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded border hover:opacity-90"
                  style={{ color: '#f5c518', borderColor: 'rgba(245,197,24,0.35)', background: 'rgba(245,197,24,0.08)' }}>
                  <img src="/icons/imdb.svg" alt="IMDb" className="w-5 h-5" />
                  IMDb
                </a>
              )}
              {tmdbLink && (
                <a href={tmdbLink} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded border hover:opacity-90"
                  style={{ color: '#5eead4', borderColor: 'rgba(94,234,212,0.35)', background: 'rgba(45,212,191,0.08)' }}>
                  <img src="/icons/tmdb.svg" alt="TMDb" className="w-5 h-5" />
                  TMDb
                </a>
              )}
            </div>

            <div className="rounded-lg border border-[#26263a] bg-[#1b1b29]/60 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#8b87aa] inline-flex items-center gap-1.5">
                <Tag size={12} />
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.35)', color: '#c4b5fd' }}>
                    {t}
                    <button onClick={() => removeTag(t)} className="opacity-70 hover:opacity-100 leading-none">×</button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-xs text-[#6b6888]">No tags</span>}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={selectedTag}
                  onChange={e => setSelectedTag(e.target.value)}
                  className="px-2 py-1 rounded text-xs focus:outline-none min-w-[10rem]"
                  style={{ background: '#151521', border: '1px solid #2d2d45', color: '#d4cfff' }}
                >
                  <option value="">Select existing tag</option>
                  {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={addExistingTag}
                  disabled={!selectedTag || patchMutation.isPending}
                  className="px-2 py-1 rounded text-xs border disabled:opacity-50"
                  style={{ borderColor: '#3a3657', color: '#c4b5fd' }}
                >
                  Add tag
                </button>
                <input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNewTag(); }}
                  placeholder="new tag"
                  className="px-2 py-1 rounded text-xs focus:outline-none"
                  style={{ background: '#151521', border: '1px solid #2d2d45', color: '#d4cfff' }}
                />
                <button
                  onClick={addNewTag}
                  disabled={!addableTag || patchMutation.isPending}
                  className="px-2 py-1 rounded text-xs border disabled:opacity-50"
                  style={{ borderColor: '#3a3657', color: '#c4b5fd' }}
                >
                  Add new
                </button>
              </div>
            </div>

            {/* Files */}
            <div>
              <h3 className="text-xs font-semibold text-[#6b6888] uppercase tracking-wider mb-2">
                Files ({data.files.length})
              </h3>
              <div className="space-y-2">
                {data.files.map(f => <FileCard key={f.id} file={f} />)}
              </div>
            </div>

            {/* Scout releases (Phase 1) */}
            {enableScoutSearch && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#6b6888] uppercase tracking-wider">
                    Scout Releases
                  </h3>
                  <button
                    onClick={() => scoutSearch.mutate()}
                    disabled={scoutSearch.isPending}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border disabled:opacity-50"
                    style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
                    title="Search live releases from Prowlarr">
                    {scoutSearch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    Scout Releases
                  </button>
                </div>
                {scoutSearch.isError && (
                  <div className="text-xs text-red-400 inline-flex items-center gap-1">
                    <AlertCircle size={12} />
                    {(scoutSearch.error as Error).message}
                  </div>
                )}
                {scoutSearch.data && scoutSearch.data.releases.length === 0 && (
                  <div className="text-xs text-[#8b87aa]">No releases found.</div>
                )}
                {scoutSearch.data && scoutSearch.data.releases.length > 0 && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-[#3a3657] bg-[#1e1e2e]/60 px-3 py-2 text-xs">
                      <div className="text-[#8b87aa] uppercase tracking-wider mb-1">Most Efficient Path</div>
                      <div className="text-[#d4cfff]">{scoutSearch.data.recommendation.summary}</div>
                      {scoutSearch.data.recommendation.best && (
                        <div className="mt-1 text-[#8b87aa]">
                          Recommended: <span className="text-amber-400 font-semibold">{scoutSearch.data.recommendation.best.title}</span>
                        </div>
                      )}
                    </div>
                    <ScoutResultsTable releases={scoutSearch.data.releases} />
                  </div>
                )}
              </div>
            )}

            {/* Folder path */}
            <div className="text-xs text-[#6b6888] font-mono break-all">
              {data.folder_path}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
