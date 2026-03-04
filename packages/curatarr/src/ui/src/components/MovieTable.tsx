import { type Movie } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge } from './QualityBadge.js';

interface Props {
  movies: Movie[];
  onSelect: (id: number) => void;
  selectedId?: number;
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function MovieTable({ movies, onSelect, selectedId }: Props) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[#26263a] text-left text-xs text-[#6b6888] uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Year</th>
            <th className="px-3 py-2 font-medium">Quality</th>
            <th className="px-3 py-2 font-medium">HDR</th>
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 font-medium text-right">MC</th>
            <th className="px-3 py-2 font-medium text-right">IMDb</th>
            <th className="px-3 py-2 font-medium text-right">Size</th>
          </tr>
        </thead>
        <tbody>
          {movies.map((m) => (
            <tr
              key={m.id}
              onClick={() => onSelect(m.id)}
              className={
                `border-b border-[#26263a]/60 cursor-pointer transition-colors hover:bg-[#1e1e2e]/40 ` +
                (selectedId === m.id ? 'bg-indigo-900/20' : '')
              }
            >
              <td className="px-3 py-2 max-w-xs">
                <span className="truncate block font-medium text-[#f0eeff]">
                  {m.jellyfin_title ?? m.parsed_title ?? m.folder_name}
                </span>
              </td>
              <td className="px-3 py-2 text-[#8b87aa] whitespace-nowrap">
                {m.parsed_year ?? '—'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="inline-flex gap-1">
                  <ResolutionBadge resolution={m.resolution_cat} />
                  <CodecBadge codec={m.video_codec} />
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <HdrBadge hdrFormats={m.hdr_formats} dvProfile={m.dv_profile} />
              </td>
              <td className="px-3 py-2 text-[#8b87aa] text-xs max-w-[100px] truncate">
                {m.release_group ?? '—'}
              </td>
              <td className="px-3 py-2 text-right text-[#c4b5fd]">
                {m.critic_rating != null ? m.critic_rating : '—'}
              </td>
              <td className="px-3 py-2 text-right text-[#c4b5fd]">
                {m.community_rating != null ? m.community_rating.toFixed(1) : '—'}
              </td>
              <td className="px-3 py-2 text-right text-[#8b87aa] text-xs">
                {fmtSize(m.file_size)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
