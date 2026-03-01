import { useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api, type Movie, type Stats } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, QualityFlagsBadge } from '../components/QualityBadge.js';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer.js';

const RESOLUTION_OPTIONS = ['2160p', '1080p', '720p', '480p', 'other'];
const CODEC_OPTIONS = ['hevc', 'h264', 'av1', 'mpeg4'];

// Status dots: scan health + JF match
function StatusDots({ m }: { m: Movie }) {
  // Scan status
  let scanColor = '#3f3f5a';   // gray = not yet scanned
  let scanTitle = 'Not scanned yet';
  if (m.scan_error) {
    scanColor = '#f87171';     // red = scan error
    scanTitle = `Scan error: ${m.scan_error}`;
  } else if (m.scanned_at) {
    if (m.verify_status === 'fail') {
      scanColor = '#fb923c';   // orange = verify failed
      scanTitle = 'Verify failed — file may be corrupt';
    } else {
      scanColor = '#4ade80';   // green = scanned ok
      scanTitle = 'Scanned successfully';
    }
  } else if (m.file_id) {
    scanColor = '#fbbf24';     // yellow = file exists, not yet scanned
    scanTitle = 'File found but not scanned yet';
  }

  // JF sync status
  const jfColor = m.jellyfin_id ? '#7c3aed' : '#3f3f5a';
  const jfTitle = m.jellyfin_id
    ? `Jellyfin matched${m.jf_synced_at ? ` · synced ${m.jf_synced_at.slice(0, 10)}` : ''}`
    : 'Not matched in Jellyfin';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full inline-block shrink-0"
        style={{ background: scanColor }} title={scanTitle} />
      <span className="w-2 h-2 rounded-full inline-block shrink-0"
        style={{ background: jfColor }} title={jfTitle} />
    </span>
  );
}
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

type SortField = 'quality' | 'title' | 'year' | 'rating' | 'size';

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

function fmtTotalSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

function SortHeader({
  field, label, current, dir, onChange, align = 'left',
}: {
  field: SortField; label: string; current: SortField;
  dir: 'asc' | 'desc'; onChange: (f: SortField) => void; align?: 'left' | 'right';
}) {
  const active = current === field;
  return (
    <th
      className={`px-3 py-2 font-medium text-xs uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--c-muted)' }}
      onClick={() => onChange(field)}
    >
      <span className="inline-flex items-center gap-1">
        {align === 'right' && (active
          ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronsUpDown size={11} className="opacity-30" />)}
        {label}
        {align !== 'right' && (active
          ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronsUpDown size={11} className="opacity-30" />)}
      </span>
    </th>
  );
}

// ─── URL state helpers ────────────────────────────────────────────────────────

function sp(params: URLSearchParams, key: string, fallback: string): string {
  return params.get(key) ?? fallback;
}
function spInt(params: URLSearchParams, key: string, fallback: number): number {
  const v = params.get(key);
  const n = v ? parseInt(v, 10) : NaN;
  return isNaN(n) ? fallback : n;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Library() {
  const [searchParams, setSearchParams] = useSearchParams();

  // All state lives in URL params (bookmarkable)
  const page       = spInt(searchParams, 'page', 1);
  const limit      = spInt(searchParams, 'limit', 50);
  const sortBy     = sp(searchParams, 'sort', 'quality') as SortField;
  const sortDir    = sp(searchParams, 'dir', 'asc') as 'asc' | 'desc';
  const resolution = sp(searchParams, 'resolution', '');
  const codec      = sp(searchParams, 'codec', '');
  const hdrOnly    = searchParams.get('hdr') === '1';
  const noJf       = searchParams.get('noJf') === '1';
  const search     = sp(searchParams, 'q', '');
  const selectedId = spInt(searchParams, 'movie', 0) || undefined;

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch(changes: Record<string, string | null>) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }

  function handleSearchInput(val: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      patch({ q: val, page: '1' });
    }, 300);
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      patch({ dir: sortDir === 'asc' ? 'desc' : 'asc', page: '1' });
    } else {
      patch({ sort: field, dir: field === 'quality' ? 'desc' : 'asc', page: '1' });
    }
  }

  function clearFilters() {
    patch({ q: null, resolution: null, codec: null, hdr: null, noJf: null, page: '1' });
  }

  const { data: statsData } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: api.stats,
    staleTime: 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['movies', page, limit, search, resolution, codec, hdrOnly, noJf, sortBy, sortDir],
    queryFn: () => api.movies({
      page, limit, sortBy, sortDir,
      ...(search ? { search } : {}),
      ...(resolution ? { resolution } : {}),
      ...(codec ? { codec } : {}),
      ...(hdrOnly ? { hdr: 'true' } : {}),
      ...(noJf ? { noJf: 'true' } : {}),
    }),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;
  const hasActiveFilter = search || resolution || codec || hdrOnly || noJf;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="px-4 py-2.5 border-b flex flex-wrap items-center gap-2 shrink-0"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--c-muted)' }} />
          <input
            type="text" placeholder="Search titles…"
            defaultValue={search}
            onChange={e => handleSearchInput(e.target.value)}
            className="pl-7 pr-3 py-1.5 rounded-lg text-sm focus:outline-none w-52"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
          />
        </div>

        {/* Resolution chips */}
        <div className="flex items-center gap-1">
          {RESOLUTION_OPTIONS.map(r => (
            <button key={r}
              onClick={() => patch({ resolution: resolution === r ? null : r, page: '1' })}
              className="px-2 py-1 text-xs rounded border transition-colors"
              style={resolution === r
                ? { background: 'var(--c-accent)', borderColor: 'var(--c-accent)', color: 'white' }
                : { borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
              {r}
            </button>
          ))}
        </div>

        {/* Codec chips */}
        <div className="flex items-center gap-1">
          {CODEC_OPTIONS.map(c => (
            <button key={c}
              onClick={() => patch({ codec: codec === c ? null : c, page: '1' })}
              className="px-2 py-1 text-xs rounded border transition-colors"
              style={codec === c
                ? { background: 'var(--c-accent)', borderColor: 'var(--c-accent)', color: 'white' }
                : { borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
              {c}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--c-muted)' }}>
          <input type="checkbox" checked={hdrOnly}
            onChange={e => patch({ hdr: e.target.checked ? '1' : null, page: '1' })}
            className="accent-violet-600" />
          HDR
        </label>

        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--c-muted)' }}
          title="Show movies not yet matched in Jellyfin">
          <input type="checkbox" checked={noJf}
            onChange={e => patch({ noJf: e.target.checked ? '1' : null, page: '1' })}
            className="accent-violet-600" />
          No JF
        </label>

        {hasActiveFilter && (
          <button onClick={clearFilters} className="text-xs underline" style={{ color: 'var(--c-muted)' }}>
            clear
          </button>
        )}

        {/* Page size */}
        <div className="flex items-center gap-1.5 ml-2 text-xs" style={{ color: 'var(--c-muted)' }}>
          <span>Show</span>
          <select
            value={limit}
            onChange={e => patch({ limit: e.target.value, page: '1' })}
            className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}>
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <span className="ml-auto text-xs flex items-center gap-2" style={{ color: 'var(--c-muted)' }}>
          {isFetching && (
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--c-accent)' }} />
          )}
          {data ? (
            <>
              <span className="font-semibold" style={{ color: 'var(--c-text)' }}>{data.total.toLocaleString()}</span>
              <span>movies</span>
            </>
          ) : '—'}
          {statsData?.totalLibrarySize ? (
            <>
              <span style={{ color: 'var(--c-border)' }}>·</span>
              <span title="Total size on disk (all scanned files)">
                {fmtTotalSize(statsData.totalLibrarySize)}
              </span>
            </>
          ) : null}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>Loading…</div>
        ) : !data?.movies.length ? (
          <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>No movies match the current filters.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--c-bg)' }}>
              <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                <SortHeader field="title"  label="Title"  current={sortBy} dir={sortDir} onChange={handleSort} />
                <SortHeader field="year"   label="Year"   current={sortBy} dir={sortDir} onChange={handleSort} />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>Quality</th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>HDR</th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>Group</th>
                <SortHeader field="rating" label="MC"     current={sortBy} dir={sortDir} onChange={handleSort} align="right" />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-right"
                  style={{ color: 'var(--c-muted)' }}>IMDb</th>
                <SortHeader field="size"   label="Size"   current={sortBy} dir={sortDir} onChange={handleSort} align="right" />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center"
                  style={{ color: 'var(--c-muted)', minWidth: '72px' }}
                  title="Quality analytics — populated after Deep Verify. FLAG = playback issue. WARN = quality concern. Click badge for details + docs.">
                  Issues
                </th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center w-14"
                  style={{ color: 'var(--c-muted)' }}
                  title="Scan · Jellyfin match status">⬡</th>
              </tr>
            </thead>
            <tbody>
              {data.movies.map((m: Movie) => (
                <tr
                  key={m.id}
                  onClick={() => patch({ movie: selectedId === m.id ? null : String(m.id) })}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid rgba(38,38,58,0.5)',
                    background: selectedId === m.id ? 'rgba(124,58,237,0.1)' : undefined,
                  }}
                  onMouseEnter={e => { if (selectedId !== m.id) (e.currentTarget as HTMLElement).style.background = 'rgba(22,22,31,0.7)'; }}
                  onMouseLeave={e => { if (selectedId !== m.id) (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <td className="px-3 py-2 max-w-xs">
                    <Link
                      to={`/movies/${m.id}`}
                      onClick={e => e.stopPropagation()}
                      className="truncate block font-medium text-sm hover:underline"
                      style={{ color: 'var(--c-text)' }}>
                      {m.jellyfin_title ?? m.parsed_title ?? m.folder_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap" style={{ color: 'var(--c-muted)' }}>
                    {m.parsed_year ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      <ResolutionBadge resolution={m.resolution_cat} />
                      <CodecBadge codec={m.video_codec} showCompatWarning />
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <HdrBadge hdrFormats={m.hdr_formats} dvProfile={m.dv_profile} />
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[90px] truncate" style={{ color: 'var(--c-muted)' }}>
                    {m.release_group ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-sm" style={{ color: '#c4b5fd' }}>
                    {m.critic_rating != null ? m.critic_rating : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-sm" style={{ color: '#c4b5fd' }}>
                    {m.community_rating != null ? m.community_rating.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap" style={{ color: 'var(--c-muted)' }}>
                    {fmtSize(m.file_size)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <QualityFlagsBadge
                      qualityFlagsJson={m.quality_flags}
                      verifyStatus={m.verify_status}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusDots m={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t flex items-center justify-between text-sm shrink-0"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <button
            onClick={() => patch({ page: String(Math.max(1, page - 1)) })}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm disabled:opacity-40"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            <ChevronLeft size={13} /> Prev
          </button>

          <div className="flex items-center gap-2" style={{ color: 'var(--c-muted)' }}>
            <span>Page {page} of {totalPages}</span>
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <span style={{ fontSize: '0.7rem' }}>
              {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, data?.total ?? 0).toLocaleString()} of {data?.total.toLocaleString()}
            </span>
          </div>

          <button
            onClick={() => patch({ page: String(Math.min(totalPages, page + 1)) })}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-sm disabled:opacity-40"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}

      {selectedId && (
        <MovieDetailDrawer movieId={selectedId} onClose={() => patch({ movie: null })} />
      )}
    </div>
  );
}
