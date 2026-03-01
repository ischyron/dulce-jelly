import { useQuery } from '@tanstack/react-query';
import { X, Film, Star, Tv2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type FileRow } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge } from './QualityBadge.js';

interface Props {
  movieId: number;
  onClose: () => void;
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

function FileCard({ file }: { file: FileRow }) {
  const audioTracks: { codec: string; channels: number; language: string }[] =
    file.audio_tracks ? JSON.parse(file.audio_tracks) : [];
  const subtitles: string[] = file.subtitle_langs ? JSON.parse(file.subtitle_langs) : [];

  return (
    <div className="bg-[#1e1e2e]/60 border border-[#26263a] rounded-lg p-3 space-y-2 text-sm">
      <div className="font-mono text-xs text-[#8b87aa] truncate" title={file.filename}>
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

export function MovieDetailDrawer({ movieId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['movie', movieId],
    queryFn: () => api.movie(movieId),
  });

  const genres: string[] = data?.genres ? JSON.parse(data.genres) : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside className="w-[520px] max-w-full bg-[#16161f] border-l border-[#26263a] flex flex-col overflow-hidden">
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
            {/* Title */}
            <div>
              <h2 className="text-lg font-bold text-[#f0eeff]">
                {data.jellyfin_title ?? data.parsed_title ?? data.folder_name}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-[#8b87aa]">
                <span>{data.parsed_year ?? '—'}</span>
                {data.critic_rating != null && (
                  <span className="flex items-center gap-1">
                    <Tv2 size={12} />
                    MC {data.critic_rating}
                  </span>
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
            </div>

            {/* Overview */}
            {data.overview && (
              <p className="text-sm text-[#8b87aa] leading-relaxed">{data.overview}</p>
            )}

            {/* IDs — jellyfin_id is the canonical curatarr↔Jellyfin link */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b6888]">
              {data.imdb_id && (
                <span>IMDb: <a href={`https://www.imdb.com/title/${data.imdb_id}/`} target="_blank" rel="noreferrer"
                  className="text-[#c4b5fd] hover:underline">{data.imdb_id}</a></span>
              )}
              {data.tmdb_id && (
                <span>TMDb: <a href={`https://www.themoviedb.org/movie/${data.tmdb_id}`} target="_blank" rel="noreferrer"
                  className="text-[#c4b5fd] hover:underline">{data.tmdb_id}</a></span>
              )}
              {data.jellyfin_id && (
                <span className="truncate">JF: <span className="text-[#c4b5fd] font-mono">{data.jellyfin_id}</span></span>
              )}
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
