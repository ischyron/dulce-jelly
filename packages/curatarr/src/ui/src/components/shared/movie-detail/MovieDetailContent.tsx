import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type DroppedScoutRelease, type FileRow, type ScoutRelease, api } from '../../../api/client';
import { CodecBadge, CriticScoreBadge, HdrBadge, ResolutionBadge } from '../../QualityBadge';
import { DeleteConfirmModal } from '../modals';
import { formatSyncDate } from '../utils';

interface Props {
  movieId: number;
  mode: 'page' | 'drawer';
  onClose?: () => void;
  onDeleted?: () => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatAge(value: string | null): string {
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

function formatReleaseSize(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

type ScoutResultView = 'candidates' | 'dropped' | 'all';

type ScoutResultRow = (ScoutRelease | DroppedScoutRelease) & {
  kind: 'candidate' | 'dropped';
  droppedReason?: string;
};

const SCOUT_CHIP_GROUPS: Record<'Resolution' | 'Source' | 'Audio', string[]> = {
  Resolution: ['2160p', '1080p', '720p'],
  Source: ['Remux', 'BluRay', 'WEB-DL'],
  Audio: ['DTS-MA', 'DTS', 'TrueHD', 'Atmos', 'DDP', 'AC3', 'AAC'],
};

const SCOUT_PROTOCOL_CHIPS = ['Torrent', 'Usenet', 'Unknown'];

function releaseTitleTags(title: string): string[] {
  const t = title.toLowerCase();
  const out = new Set<string>();

  if (/\b2160p\b|\b4k\b/.test(t)) out.add('2160p');
  if (/\b1080p\b/.test(t)) out.add('1080p');
  if (/\b720p\b/.test(t)) out.add('720p');

  if (/\bremux\b/.test(t)) out.add('Remux');
  if (/\bblu[- .]?ray\b|\bbdrip\b/.test(t)) out.add('BluRay');
  if (/\bweb[- .]?dl\b/.test(t)) out.add('WEB-DL');

  if (/\bdts[- .]?(hd[- .]?ma|ma)\b/.test(t)) out.add('DTS-MA');
  if (/\btruehd\b/.test(t)) out.add('TrueHD');
  if (/\batmos\b/.test(t)) out.add('Atmos');
  if (/\bddp\b|\beac3\b|\bdd\+\b/.test(t)) out.add('DDP');
  if (/\bac3\b/.test(t)) out.add('AC3');
  if (/\baac\b/.test(t)) out.add('AAC');
  if (/\bdts\b/.test(t)) out.add('DTS');

  return [...out];
}

function protocolChipForRelease(protocol: string | null | undefined): string {
  const value = (protocol ?? '').toLowerCase();
  if (value === 'torrent') return 'Torrent';
  if (value === 'usenet') return 'Usenet';
  return 'Unknown';
}

function resultChipGroups(rows: ScoutResultRow[]): Array<{ label: string; chips: string[] }> {
  const has = new Set(rows.flatMap((r) => releaseTitleTags(r.title)));
  const hasProtocol = new Set(rows.map((r) => protocolChipForRelease(r.protocol)));
  const pick = (chips: string[]) => chips.filter((c) => has.has(c));
  const pickProtocol = (chips: string[]) => chips.filter((c) => hasProtocol.has(c));
  return [
    { label: 'Resolution', chips: pick([...SCOUT_CHIP_GROUPS.Resolution]) },
    { label: 'Source', chips: pick([...SCOUT_CHIP_GROUPS.Source]) },
    { label: 'Audio', chips: pick([...SCOUT_CHIP_GROUPS.Audio]) },
    { label: 'Protocol', chips: pickProtocol(SCOUT_PROTOCOL_CHIPS) },
  ].filter((g) => g.chips.length > 0);
}

function releaseMatchesScoutChips(release: ScoutResultRow, selectedChips: string[]): boolean {
  if (selectedChips.length === 0) return true;

  const tags = releaseTitleTags(release.title);
  const protocolChip = protocolChipForRelease(release.protocol);
  const selected = new Set(selectedChips);
  const selectedResolution = SCOUT_CHIP_GROUPS.Resolution.filter((chip) => selected.has(chip));
  const selectedSource = SCOUT_CHIP_GROUPS.Source.filter((chip) => selected.has(chip));
  const selectedAudio = SCOUT_CHIP_GROUPS.Audio.filter((chip) => selected.has(chip));
  const selectedProtocol = SCOUT_PROTOCOL_CHIPS.filter((chip) => selected.has(chip));
  const selectedKnown =
    selectedResolution.length + selectedSource.length + selectedAudio.length + selectedProtocol.length;
  const unknown = selectedChips.filter(
    (chip) =>
      !SCOUT_CHIP_GROUPS.Resolution.includes(chip) &&
      !SCOUT_CHIP_GROUPS.Source.includes(chip) &&
      !SCOUT_CHIP_GROUPS.Audio.includes(chip) &&
      !SCOUT_PROTOCOL_CHIPS.includes(chip),
  );

  const resolutionOk = selectedResolution.length === 0 || selectedResolution.some((chip) => tags.includes(chip));
  const sourceOk = selectedSource.length === 0 || selectedSource.some((chip) => tags.includes(chip));
  const audioOk = selectedAudio.length === 0 || selectedAudio.every((chip) => tags.includes(chip));
  const protocolOk = selectedProtocol.length === 0 || selectedProtocol.some((chip) => chip === protocolChip);
  const unknownOk = selectedKnown === selectedChips.length || unknown.every((chip) => tags.includes(chip));

  return resolutionOk && sourceOk && audioOk && protocolOk && unknownOk;
}

function recommendationReasonText(release: ScoutRelease | null): string {
  if (!release) return 'Balanced match';
  const tags = [...releaseTitleTags(release.title)];
  const protocol = protocolChipForRelease(release.protocol);
  if (protocol !== 'Unknown') tags.push(protocol);
  const uniq = [...new Set(tags)];
  return uniq.length > 0 ? uniq.join(', ') : 'Balanced match';
}

function ScoutResultsAllTable({ releases }: { releases: ScoutResultRow[] }) {
  return (
    <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--c-border)' }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
            <th className="px-2 py-2 text-left">State</th>
            <th className="px-2 py-2 text-left">Score</th>
            <th className="px-2 py-2 text-left">Release</th>
            <th className="px-2 py-2 text-left">Indexer</th>
            <th className="px-2 py-2 text-left">Protocol</th>
            <th className="px-2 py-2 text-right">Size</th>
            <th className="px-2 py-2 text-right">Age</th>
            <th className="px-2 py-2 text-right">S/P</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r, i) => (
            <tr key={`${r.guid ?? r.title}-all-${i}`} style={{ borderTop: '1px solid rgba(38,38,58,0.8)' }}>
              <td className="px-2 py-1.5">
                <span
                  className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: r.kind === 'candidate' ? 'rgba(74,222,128,0.16)' : 'rgba(251,191,36,0.16)',
                    color: r.kind === 'candidate' ? '#4ade80' : '#fbbf24',
                    border: `1px solid ${r.kind === 'candidate' ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.35)'}`,
                  }}
                >
                  {r.kind === 'candidate' ? 'Candidate' : 'Dropped'}
                </span>
              </td>
              <td className="px-2 py-1.5 font-semibold text-amber-400">{r.score}</td>
              <td className="px-2 py-1.5">
                <div className="truncate" style={{ color: '#d4cfff' }} title={r.title}>
                  {r.title}
                </div>
                {r.reasons.length > 0 && (
                  <div className="text-[10px] truncate" style={{ color: '#6b6888' }}>
                    {r.reasons.join(', ')}
                  </div>
                )}
                {r.kind === 'dropped' && r.droppedReason && (
                  <div className="text-[10px]" style={{ color: '#fbbf24' }}>
                    Reason: {r.droppedReason}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5" style={{ color: 'var(--c-muted)' }}>
                {r.indexer ?? '—'}
              </td>
              <td className="px-2 py-1.5 uppercase" style={{ color: 'var(--c-muted)' }}>
                {r.protocol}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {formatReleaseSize(r.size)}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {formatAge(r.publishDate)}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {r.seeders ?? 0}/{r.peers ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function FileCard({ file }: { file: FileRow }) {
  const audioTracks: { codec: string; channels: number; language: string }[] = safeJsonParse(file.audio_tracks, []);
  const subtitles: string[] = safeJsonParse(file.subtitle_langs, []);

  return (
    <div
      className="rounded-lg border p-3 space-y-2 text-sm"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
    >
      <div
        className="font-mono text-xs whitespace-normal break-all leading-5"
        style={{ color: 'var(--c-muted)' }}
        title={file.filename}
      >
        {file.filename}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <ResolutionBadge resolution={file.resolution_cat} />
        <CodecBadge codec={file.video_codec} />
        <HdrBadge hdrFormats={file.hdr_formats} dvProfile={file.dv_profile} />
        {file.bit_depth && file.bit_depth > 8 && (
          <span
            className="px-1.5 py-0.5 text-xs font-mono rounded border"
            style={{ background: 'rgba(38,38,58,0.5)', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
          >
            {file.bit_depth}-bit
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--c-muted)' }}>
        <span>
          Size: <span style={{ color: '#d4cfff' }}>{formatSize(file.file_size)}</span>
        </span>
        <span>
          Duration: <span style={{ color: '#d4cfff' }}>{formatDuration(file.duration)}</span>
        </span>
        <span>
          MB/min: <span style={{ color: '#d4cfff' }}>{file.mb_per_minute?.toFixed(1) ?? '—'}</span>
        </span>
        <span>
          Container: <span style={{ color: '#d4cfff' }}>{(file.container ?? '—').toUpperCase()}</span>
        </span>
        {file.release_group && (
          <span>
            Group: <span style={{ color: '#d4cfff' }}>{file.release_group}</span>
          </span>
        )}
        {file.audio_profile && (
          <span>
            Audio: <span style={{ color: '#d4cfff' }}>{file.audio_profile}</span>
          </span>
        )}
      </div>
      {audioTracks.length > 1 && (
        <div className="text-xs" style={{ color: '#6b6888' }}>
          Tracks:{' '}
          {audioTracks.map((t) => `${t.codec} ${t.channels}ch${t.language ? ` [${t.language}]` : ''}`).join(', ')}
        </div>
      )}
      {subtitles.length > 0 && (
        <div className="text-xs" style={{ color: '#6b6888' }}>
          Subs: {subtitles.join(', ')}
        </div>
      )}
      {file.scan_error && <div className="text-xs text-red-400">Error: {file.scan_error}</div>}
    </div>
  );
}

function ScoutResultsTable({ releases }: { releases: ScoutRelease[] }) {
  return (
    <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--c-border)' }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
            <th className="px-2 py-2 text-left">Score</th>
            <th className="px-2 py-2 text-left">Release</th>
            <th className="px-2 py-2 text-left">Indexer</th>
            <th className="px-2 py-2 text-left">Protocol</th>
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
                <div className="truncate" style={{ color: '#d4cfff' }} title={r.title}>
                  {r.title}
                </div>
                {r.reasons.length > 0 && (
                  <div className="text-[10px] truncate" style={{ color: '#6b6888' }}>
                    {r.reasons.join(', ')}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5" style={{ color: 'var(--c-muted)' }}>
                {r.indexer ?? '—'}
              </td>
              <td className="px-2 py-1.5 uppercase" style={{ color: 'var(--c-muted)' }}>
                {r.protocol}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {formatReleaseSize(r.size)}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {formatAge(r.publishDate)}
              </td>
              <td className="px-2 py-1.5 text-right" style={{ color: 'var(--c-muted)' }}>
                {r.seeders ?? 0}/{r.peers ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DroppedScoutResultsTable({ releases }: { releases: DroppedScoutRelease[] }) {
  return (
    <div className="overflow-auto rounded-lg border" style={{ borderColor: 'var(--c-border)' }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
            <th className="px-2 py-2 text-left">Score</th>
            <th className="px-2 py-2 text-left">Release</th>
            <th className="px-2 py-2 text-left">Dropped Reason</th>
          </tr>
        </thead>
        <tbody>
          {releases.map((r, i) => (
            <tr key={`${r.guid ?? r.title}-drop-${i}`} style={{ borderTop: '1px solid rgba(38,38,58,0.8)' }}>
              <td className="px-2 py-1.5 font-semibold text-orange-300">{r.score}</td>
              <td className="px-2 py-1.5">
                <div className="truncate" style={{ color: '#d4cfff' }} title={r.title}>
                  {r.title}
                </div>
              </td>
              <td className="px-2 py-1.5" style={{ color: 'var(--c-muted)' }}>
                {r.droppedReason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MovieDetailContent({ movieId, mode, onDeleted }: Props) {
  const queryClient = useQueryClient();
  const { data: settingsData } = useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 60_000 });
  const { data: tagsData } = useQuery({ queryKey: ['tags'], queryFn: api.tags, staleTime: 60_000 });
  const { data, isLoading, isError } = useQuery({ queryKey: ['movie', movieId], queryFn: () => api.movie(movieId) });

  const [selectedTag, setSelectedTag] = useState('');
  const [newTag, setNewTag] = useState('');
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [scoutResultView, setScoutResultView] = useState<ScoutResultView>('candidates');
  const [scoutFilterChips, setScoutFilterChips] = useState<string[]>([]);
  const scoutSectionRef = useRef<HTMLDivElement | null>(null);
  const scoutHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (data) setNotes(data.notes ?? '');
  }, [data]);

  const patchMutation = useMutation({
    mutationFn: (meta: { tags?: string[]; notes?: string }) => api.patchMovie(movieId, meta),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      await queryClient.invalidateQueries({ queryKey: ['movies'] });
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const scoutSearch = useMutation({
    mutationFn: () => api.scoutSearchOne({ movieId }),
    onSuccess: () => {
      setScoutResultView('candidates');
      setScoutFilterChips([]);
    },
  });
  const jfRefreshMutation = useMutation({
    mutationFn: () => api.jfRefreshMovie(movieId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
      await queryClient.invalidateQueries({ queryKey: ['movies'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm" style={{ color: 'var(--c-muted)' }}>
        Loading…
      </div>
    );
  }
  if (isError || !data) {
    return <div className="p-6 text-sm text-red-400">Movie not found.</div>;
  }

  const displayTitle = data.jellyfin_title ?? data.parsed_title ?? data.folder_name;
  const genres: string[] = safeJsonParse(data.genres, []);
  const tags: string[] = safeJsonParse(data.tags, []);
  const availableTags = (tagsData?.tags ?? []).filter((t) => !tags.includes(t));
  const addableTag = normalizeTag(newTag);
  const disambiguationReason = data.disambiguation_reason ?? null;
  const disambiguationRequired = Boolean(data.disambiguation_required);
  const pendingJellyfinSync = !data.jf_synced_at;
  const criticValue = data.critic_rating != null ? String(data.critic_rating) : '—';
  const imdbValue = data.community_rating != null ? data.community_rating.toFixed(1) : '—';

  const jellyfinBase = (settingsData?.settings.jellyfinPublicUrl ?? '').replace(/\/+$/, '');
  const jellyfinDeepLink =
    data.jellyfin_id && jellyfinBase ? `${jellyfinBase}/web/#/details?id=${data.jellyfin_id}` : undefined;
  const imdbLink = data.imdb_id ? `https://www.imdb.com/title/${data.imdb_id}/` : undefined;
  const tmdbId = data.tmdb_id?.match(/\d+/)?.[0] ?? '';
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
    patchMutation.mutate({ tags: tags.filter((t) => t !== tag) });
  }

  function saveNotes() {
    patchMutation.mutate({ notes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  }

  function triggerScoutAndJump() {
    scoutSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => scoutHeadingRef.current?.focus(), 120);
    scoutSearch.mutate();
  }

  return (
    <>
      <div className={mode === 'page' ? 'space-y-5' : 'space-y-4'}>
        <div className="flex flex-col md:flex-row items-start gap-4">
          <div
            className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
            style={{
              width: mode === 'page' ? 176 : 148,
              height: mode === 'page' ? 264 : 222,
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
            }}
          >
            {data.jellyfin_id ? (
              <img
                src={`/api/proxy/image/${data.jellyfin_id}`}
                alt="Poster"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Film size={36} style={{ color: 'var(--c-border)' }} />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <h1
              className={mode === 'page' ? 'text-2xl font-bold break-words' : 'text-lg font-bold break-words'}
              style={{ color: 'var(--c-text)' }}
            >
              {displayTitle}
            </h1>

            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--c-muted)' }}>
              <span>{data.jellyfin_year ?? data.parsed_year ?? '—'}</span>
              {genres.map((g) => (
                <span
                  key={g}
                  className="px-2 py-0.5 text-xs rounded"
                  style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}
                >
                  {g}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--c-muted)' }}>
              <span title="IMDb community rating (0-10) from Jellyfin CommunityRating">
                IMDb rating: <span style={{ color: '#d4cfff' }}>{imdbValue}</span>
              </span>
              <span title="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin.">
                Jellyfin critic score:{' '}
                <span style={{ color: '#d4cfff' }}>
                  <CriticScoreBadge score={data.critic_rating} />
                </span>
              </span>
            </div>

            <div className="block w-full text-xs" style={{ color: '#8b87aa' }} data-testid="movie-synced-row">
              Jellyfin Synced:{' '}
              <span style={{ color: '#d4cfff' }}>{data.jf_synced_at ? formatSyncDate(data.jf_synced_at) : '—'}</span>
              {pendingJellyfinSync && (
                <span className="italic ml-2" style={{ color: 'var(--c-muted)' }}>
                  pending Jellyfin sync
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full" data-testid="movie-links-row">
              {jellyfinDeepLink && (
                <a
                  href={jellyfinDeepLink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in Jellyfin"
                  title="Open in Jellyfin"
                  className="inline-flex items-center justify-center rounded border hover:opacity-90"
                  style={{ width: 32, height: 32, borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
                >
                  <img src="/icons/jellyfin.svg" alt="Jellyfin" className="w-4 h-4" />
                </a>
              )}
              {imdbLink && (
                <a
                  href={imdbLink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open IMDb"
                  title="Open IMDb"
                  className="inline-flex items-center justify-center rounded border hover:opacity-90"
                  style={{ height: 32, padding: '0 8px', borderColor: 'rgba(255,255,255,0.3)', background: '#fff' }}
                >
                  <img src="/icons/imdb.svg" alt="IMDb" className="h-4 w-auto" />
                </a>
              )}
              {tmdbLink && (
                <a
                  href={tmdbLink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open TMDb"
                  title="Open TMDb"
                  className="inline-flex items-center justify-center rounded border hover:opacity-90"
                  style={{ height: 32, padding: '0 8px', borderColor: 'rgba(255,255,255,0.3)', background: '#fff' }}
                >
                  <img src="/icons/tmdb.svg" alt="TMDb" className="h-4 w-auto" />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full" data-testid="movie-actions-row">
              <button
                type="button"
                onClick={triggerScoutAndJump}
                disabled={scoutSearch.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-60"
                style={{ borderColor: 'var(--c-accent)', background: 'var(--c-accent)', color: '#fff' }}
                title="Search live releases from Prowlarr"
              >
                {scoutSearch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Scout Releases
              </button>
              <button
                type="button"
                onClick={() => jfRefreshMutation.mutate()}
                disabled={jfRefreshMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border disabled:opacity-50"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                {jfRefreshMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Sync from Jellyfin
              </button>
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
                style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#f87171', background: 'rgba(239,68,68,0.1)' }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>

        {disambiguationRequired && (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{ borderColor: 'rgba(248,113,113,0.45)', background: 'rgba(127,29,29,0.18)', color: '#fecaca' }}
          >
            <div className="inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={12} /> Disambiguation needed
            </div>
            <div className="mt-1" style={{ color: '#fca5a5' }}>
              {disambiguationReason === 'missing_jellyfin_match' && 'Movie is not linked to Jellyfin yet.'}
              {disambiguationReason === 'multiple_jellyfin_candidates' &&
                'Multiple Jellyfin candidates found during refresh.'}
              {disambiguationReason === 'no_jellyfin_match' && 'No reliable Jellyfin candidate found during refresh.'}
              {!['missing_jellyfin_match', 'multiple_jellyfin_candidates', 'no_jellyfin_match'].includes(
                disambiguationReason ?? '',
              ) && 'Metadata match needs manual review.'}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => jfRefreshMutation.mutate()}
                className="px-2 py-1 rounded text-[11px] border"
                style={{ borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
              >
                Retry Jellyfin Sync
              </button>
              <Link
                to="/disambiguate"
                className="px-2 py-1 rounded text-[11px] border"
                style={{ borderColor: 'rgba(248,113,113,0.45)', color: '#fecaca' }}
              >
                Open Disambiguate
              </Link>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2">
            <div className="text-[11px] font-mono break-all" style={{ color: '#8b87aa' }}>
              {data.folder_path}
            </div>
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#8b87aa' }}>
            Video Files ({data.files.length})
          </h3>
          <div className="space-y-2">
            {data.files.map((f) => (
              <FileCard key={f.id} file={f} />
            ))}
          </div>
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(27,27,41,0.45)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5"
            style={{ color: '#8b87aa' }}
          >
            <Tag size={12} /> Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.35)',
                  color: '#c4b5fd',
                }}
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="opacity-70 hover:opacity-100 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-xs" style={{ color: '#6b6888' }}>
                No tags
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-2 py-1 rounded text-xs focus:outline-none min-w-[10rem]"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#d4cfff' }}
            >
              <option value="">Select existing tag</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addExistingTag}
              disabled={!selectedTag || patchMutation.isPending}
              className="px-2 py-1 rounded text-xs border disabled:opacity-50"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Add tag
            </button>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addNewTag();
              }}
              placeholder="new tag"
              className="px-2 py-1 rounded text-xs focus:outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#d4cfff' }}
            />
            <button
              type="button"
              onClick={addNewTag}
              disabled={!addableTag || patchMutation.isPending}
              className="px-2 py-1 rounded text-xs border disabled:opacity-50"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              Add new
            </button>
          </div>

          <div className="pt-1 border-t" style={{ borderColor: 'var(--c-border)' }}>
            <div
              className="text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 mb-2"
              style={{ color: '#8b87aa' }}
            >
              <FileText size={12} /> Notes
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={mode === 'drawer' ? 3 : 4}
              placeholder="Add notes about this movie…"
              className="w-full px-3 py-2 rounded-lg text-sm resize-y focus:outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={saveNotes}
                disabled={patchMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-60"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                Save Notes
              </button>
              {notesSaved && (
                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
          </div>
        </div>

        <div ref={scoutSectionRef} className="space-y-2" data-testid="movie-scout-section">
          <div className="flex items-center justify-between">
            <h3
              ref={scoutHeadingRef}
              tabIndex={-1}
              className="text-xs font-semibold uppercase tracking-wider focus:outline-none"
              style={{ color: '#8b87aa' }}
            >
              Scout Releases
            </h3>
            <button
              type="button"
              onClick={() => scoutSearch.mutate()}
              disabled={scoutSearch.isPending}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border disabled:opacity-50"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              title="Search live releases from Prowlarr"
            >
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
          {scoutSearch.data &&
            scoutSearch.data.releases.length === 0 &&
            (scoutSearch.data.droppedReleases?.length ?? 0) === 0 && (
              <div className="text-xs" style={{ color: '#8b87aa' }}>
                No releases found.
              </div>
            )}
          {scoutSearch.data &&
            (scoutSearch.data.releases.length > 0 || (scoutSearch.data.droppedReleases?.length ?? 0) > 0) && (
              <div className="space-y-2">
                {(() => {
                  const allResults: ScoutResultRow[] = [
                    ...scoutSearch.data.releases.map((r) => ({ ...r, kind: 'candidate' as const })),
                    ...(scoutSearch.data.droppedReleases ?? []).map((r) => ({
                      ...r,
                      kind: 'dropped' as const,
                      droppedReason: r.droppedReason,
                    })),
                  ].sort((a, b) => b.score - a.score);
                  const chipGroups = resultChipGroups(allResults);
                  const chipFilterActive = scoutResultView === 'all' && scoutFilterChips.length > 0;
                  const filteredAll =
                    scoutResultView !== 'all' || scoutFilterChips.length === 0
                      ? allResults
                      : allResults.filter((r) => releaseMatchesScoutChips(r, scoutFilterChips));
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { key: 'candidates', label: `Candidates (${scoutSearch.data.releases.length})` },
                          {
                            key: 'dropped',
                            label: `Dropped (${scoutSearch.data.droppedReleases?.length ?? 0})`,
                          },
                          { key: 'all', label: `View All (${allResults.length})` },
                        ].map((view) => (
                          <button
                            key={view.key}
                            type="button"
                            onClick={() => setScoutResultView(view.key as ScoutResultView)}
                            className="px-2 py-1 rounded border text-xs"
                            style={{
                              borderColor: scoutResultView === view.key ? '#a78bfa' : 'var(--c-border)',
                              color: scoutResultView === view.key ? '#d4cfff' : 'var(--c-muted)',
                              background: scoutResultView === view.key ? 'rgba(124,58,237,0.18)' : 'transparent',
                            }}
                          >
                            {view.label}
                          </button>
                        ))}
                      </div>

                      {scoutResultView === 'all' && (
                        <div
                          className="rounded-lg border p-2 space-y-2"
                          style={{ borderColor: 'var(--c-border)', background: 'rgba(30,30,46,0.6)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>
                              Filter Chips
                            </div>
                            {scoutFilterChips.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setScoutFilterChips([])}
                                className="text-xs underline"
                                style={{ color: '#c4b5fd' }}
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                          {chipGroups.length === 0 && (
                            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                              No detected tags for chip filters.
                            </div>
                          )}
                          {chipGroups.map((group) => (
                            <div key={group.label} className="space-y-1">
                              <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>
                                {group.label}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {group.chips.map((chip) => {
                                  const active = scoutFilterChips.includes(chip);
                                  return (
                                    <button
                                      key={`${group.label}-${chip}`}
                                      type="button"
                                      onClick={() =>
                                        setScoutFilterChips((prev) =>
                                          prev.includes(chip) ? prev.filter((v) => v !== chip) : [...prev, chip],
                                        )
                                      }
                                      className="px-2 py-0.5 rounded-full text-[11px] border"
                                      style={{
                                        borderColor: active ? '#a78bfa' : 'var(--c-border)',
                                        color: active ? '#d4cfff' : 'var(--c-muted)',
                                        background: active ? 'rgba(124,58,237,0.2)' : 'transparent',
                                      }}
                                    >
                                      {chip}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                            Showing {filteredAll.length} of {allResults.length} releases
                            {chipFilterActive ? ` (filters: ${scoutFilterChips.join(', ')})` : ''}.
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: '#3a3657', background: 'rgba(30,30,46,0.6)' }}
                >
                  <div style={{ color: '#8b87aa' }} className="uppercase tracking-wider mb-1">
                    Recommendation
                  </div>
                  {scoutSearch.data.recommendation.best ? (
                    <div className="space-y-1">
                      <div style={{ color: '#8b87aa' }}>
                        Recommended:{' '}
                        <span className="text-amber-400 font-semibold">
                          {scoutSearch.data.recommendation.best.title}
                        </span>
                      </div>
                      <div style={{ color: '#8b87aa' }}>
                        Score: <span style={{ color: '#d4cfff' }}>{scoutSearch.data.recommendation.best.score}</span>
                      </div>
                      <div style={{ color: '#8b87aa' }}>
                        Reason:{' '}
                        <span style={{ color: '#d4cfff' }}>
                          {recommendationReasonText(scoutSearch.data.recommendation.best)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: '#8b87aa' }}>No recommendation available.</div>
                  )}
                </div>
                {scoutResultView === 'candidates' && <ScoutResultsTable releases={scoutSearch.data.releases} />}
                {scoutResultView === 'dropped' && (
                  <DroppedScoutResultsTable releases={scoutSearch.data.droppedReleases ?? []} />
                )}
                {scoutResultView === 'all' && (
                  <ScoutResultsAllTable
                    releases={[
                      ...scoutSearch.data.releases.map((r) => ({ ...r, kind: 'candidate' as const })),
                      ...(scoutSearch.data.droppedReleases ?? []).map((r) => ({
                        ...r,
                        kind: 'dropped' as const,
                        droppedReason: r.droppedReason,
                      })),
                    ]
                      .sort((a, b) => b.score - a.score)
                      .filter((r) => releaseMatchesScoutChips(r, scoutFilterChips))}
                  />
                )}
              </div>
            )}
        </div>
      </div>
      {showDelete && (
        <DeleteConfirmModal
          movieId={movieId}
          movieTitle={displayTitle}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            if (onDeleted) onDeleted();
          }}
        />
      )}
    </>
  );
}
