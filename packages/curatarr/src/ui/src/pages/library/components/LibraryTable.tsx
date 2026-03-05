import type { Movie } from '../../../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, QualityFlagsBadge, CriticScoreBadge } from '../../../components/QualityBadge.js';
import { InfoHint } from '../../../components/InfoHint.js';
import type { SortField } from '../types.js';
import { SortHeader } from './SortHeader.js';
import { StatusDots } from './StatusDots.js';

interface Props {
  isLoading: boolean;
  movies: Movie[];
  hasActiveFilter: boolean;
  totalMovies?: number;
  selectedId?: number;
  selectedIds: number[];
  allPageSelected: boolean;
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: SortField) => void;
  onToggleSelectAllOnPage: (checked: boolean) => void;
  onToggleSelected: (id: number, checked: boolean) => void;
  onToggleMovieDrawer: (id: number) => void;
  formatSize: (bytes: number | null) => string;
}

export function LibraryTable({
  isLoading,
  movies,
  hasActiveFilter,
  totalMovies,
  selectedId,
  selectedIds,
  allPageSelected,
  sortBy,
  sortDir,
  onSort,
  onToggleSelectAllOnPage,
  onToggleSelected,
  onToggleMovieDrawer,
  formatSize,
}: Props) {
  if (isLoading) {
    return <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>Loading…</div>;
  }

  if (!movies.length) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>
        {hasActiveFilter
          ? 'No movies match the current filters.'
          : totalMovies === 0
            ? 'No movies scanned yet — go to Scan & Sync to analyse your library.'
            : 'No movies found.'}
      </div>
    );
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead className="sticky top-0 z-[5]" style={{ background: 'var(--c-bg)' }}>
        <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
          <th className="px-2 py-2 text-center" style={{ width: '32px' }}>
            <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded" style={{ minWidth: 28, minHeight: 28 }}>
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={(e) => onToggleSelectAllOnPage(e.target.checked)}
                className="w-5 h-5 accent-violet-600 cursor-pointer"
                title="Select all rows on this page"
              />
            </label>
          </th>
          <SortHeader field="title" label="Title" current={sortBy} dir={sortDir} onChange={onSort} />
          <SortHeader field="year" label="Year" current={sortBy} dir={sortDir} onChange={onSort} />
          <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left" style={{ color: 'var(--c-muted)' }}>Quality</th>
          <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left" style={{ color: 'var(--c-muted)' }}>HDR</th>
          <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left" style={{ color: 'var(--c-muted)' }}>
            <span className="inline-flex items-center gap-1">
              Group
              <InfoHint label="Group info" text="Torrent/Usenet release group inferred from the filename only." />
            </span>
          </th>
          <SortHeader
            field="rating"
            label="Critic"
            current={sortBy}
            dir={sortDir}
            onChange={onSort}
            align="right"
            infoTitle="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin."
          />
          <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--c-muted)' }} title="IMDb community rating (0–10) from Jellyfin CommunityRating">IMDb</th>
          <SortHeader field="size" label="Size" current={sortBy} dir={sortDir} onChange={onSort} align="right" />
          <th
            className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center"
            style={{ color: 'var(--c-muted)', minWidth: '72px' }}
            title="Quality analytics — populated after Deep Verify. FLAG = playback issue. WARN = quality concern. Click badge for details + docs."
          >
            Issues
          </th>
          <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center w-20" style={{ color: 'var(--c-muted)' }}>
            <span className="inline-flex items-center justify-center gap-1">
              Status
              <InfoHint
                label="Status color guide"
                content={
                  <div className="space-y-2">
                    <div className="font-semibold">Status dot guide</div>
                    <p className="text-[11px] opacity-90">Two dots are shown per movie: left = scan health, right = Jellyfin match state.</p>
                    <div className="text-[11px] rounded border p-2" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                      <div className="font-semibold mb-1">Left dot (Scan)</div>
                      <table className="w-full border-collapse"><tbody>
                        <tr><td className="py-0.5 pr-2 w-5"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#4ade80' }} /></td><td className="py-0.5">Scanned/verified OK</td></tr>
                        <tr><td className="py-0.5 pr-2"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#fb923c' }} /></td><td className="py-0.5">Verify failed</td></tr>
                        <tr><td className="py-0.5 pr-2"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#f87171' }} /></td><td className="py-0.5">Scan error</td></tr>
                        <tr><td className="py-0.5 pr-2"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#fbbf24' }} /></td><td className="py-0.5">Pending scan</td></tr>
                        <tr><td className="py-0.5 pr-2"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#3f3f5a' }} /></td><td className="py-0.5">Not scanned</td></tr>
                      </tbody></table>
                    </div>
                    <div className="my-2" />
                    <div className="text-[11px] rounded border p-2" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                      <div className="font-semibold mb-1">Right dot (Jellyfin)</div>
                      <table className="w-full border-collapse"><tbody>
                        <tr><td className="py-0.5 pr-2 w-5"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#7c3aed' }} /></td><td className="py-0.5">Matched in Jellyfin</td></tr>
                        <tr><td className="py-0.5 pr-2"><span className="inline-block w-2 h-2 rounded-full align-middle" style={{ background: '#3f3f5a' }} /></td><td className="py-0.5">Not matched</td></tr>
                      </tbody></table>
                    </div>
                    <p className="text-[11px] opacity-90">Tip: use <span className="font-semibold">Jellyfin Sync Needed</span> to list unmatched movies.</p>
                  </div>
                }
              />
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {movies.map((movie) => (
          <tr
            key={movie.id}
            className="transition-colors"
            style={{
              borderBottom: '1px solid rgba(38,38,58,0.5)',
              background: selectedId === movie.id ? 'rgba(124,58,237,0.1)' : undefined,
            }}
          >
            <td className="px-2 py-2 text-center">
              <label
                className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                style={{ minWidth: 28, minHeight: 28 }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(movie.id)}
                  onChange={(e) => onToggleSelected(movie.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-5 h-5 accent-violet-600 cursor-pointer"
                  title="Select row"
                />
              </label>
            </td>
            <td className="px-3 py-2 max-w-xs">
              <button
                type="button"
                onClick={() => onToggleMovieDrawer(movie.id)}
                className="truncate block font-medium text-sm hover:underline text-left w-full cursor-pointer"
                style={{ color: 'var(--c-text)' }}
              >
                {movie.jellyfin_title ?? movie.parsed_title ?? movie.folder_name}
              </button>
            </td>
            <td className="px-3 py-2 text-sm whitespace-nowrap" style={{ color: 'var(--c-muted)' }}>
              {movie.parsed_year ?? '—'}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className="inline-flex gap-1">
                <ResolutionBadge resolution={movie.resolution_cat} />
                <CodecBadge codec={movie.video_codec} showCompatWarning />
              </span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              <HdrBadge hdrFormats={movie.hdr_formats} dvProfile={movie.dv_profile} />
            </td>
            <td className="px-3 py-2 text-xs max-w-[90px] truncate" style={{ color: 'var(--c-muted)' }}>
              {movie.release_group ?? '—'}
            </td>
            <td className="px-3 py-2 text-right">
              <CriticScoreBadge score={movie.critic_rating} />
            </td>
            <td className="px-3 py-2 text-right text-sm" style={{ color: '#c4b5fd' }}>
              {movie.community_rating != null ? movie.community_rating.toFixed(1) : '—'}
            </td>
            <td className="px-3 py-2 text-right text-xs whitespace-nowrap" style={{ color: 'var(--c-muted)' }}>
              {formatSize(movie.file_size)}
            </td>
            <td className="px-3 py-2 text-center">
              <QualityFlagsBadge qualityFlagsJson={movie.quality_flags} verifyStatus={movie.verify_status} />
            </td>
            <td className="px-3 py-2 text-center">
              <StatusDots movie={movie} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
