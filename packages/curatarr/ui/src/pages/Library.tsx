import { useRef, useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api, type Movie, type Stats } from '../api/client.js';
import { ResolutionBadge, CodecBadge, HdrBadge, QualityFlagsBadge, CriticScoreBadge } from '../components/QualityBadge.js';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer.js';

const RESOLUTION_OPTIONS = ['2160p', '1080p', '720p', '480p', 'other'];
const CODEC_OPTIONS = ['hevc', 'h264', 'av1', 'mpeg4'];
const AV1_WARN_PROFILES = new Set(['android_tv', 'fire_tv']);

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

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Library() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // All state lives in URL params (bookmarkable)
  const page       = spInt(searchParams, 'page', 1);
  const limit      = spInt(searchParams, 'limit', 50);
  const sortBy     = sp(searchParams, 'sort', 'title') as SortField;
  const sortDir    = sp(searchParams, 'dir', 'asc') as 'asc' | 'desc';
  const resolution = sp(searchParams, 'resolution', '');
  const codec      = sp(searchParams, 'codec', '');
  const genre      = sp(searchParams, 'genre', '');
  const hdrOnly    = searchParams.get('hdr') === '1';
  const dvOnly     = searchParams.get('dv') === '1';
  const av1CompatOnly = searchParams.get('av1Compat') === '1';
  const legacyOnly = searchParams.get('legacy') === '1';
  const noJf       = searchParams.get('noJf') === '1';
  const tagFilter = sp(searchParams, 'tags', '');
  const selectedTags = tagFilter ? tagFilter.split(',').map(t => normalizeTag(t)).filter(Boolean) : [];
  const search     = sp(searchParams, 'q', '');
  const selectedId = spInt(searchParams, 'movie', 0) || undefined;

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagFilterRef = useRef<HTMLDivElement | null>(null);

  // Controlled input value — stays in sync with URL param but updates immediately on keystroke
  const [searchInput, setSearchInput] = useState(search);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [showAddTagsModal, setShowAddTagsModal] = useState(false);
  const [showRemoveTagsModal, setShowRemoveTagsModal] = useState(false);
  const [batchTagPick, setBatchTagPick] = useState('');
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchTags, setBatchTags] = useState<string[]>([]);
  // When URL search changes externally (clear filters, browser back/forward) sync the input
  useEffect(() => { setSearchInput(search); }, [search]);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!tagFilterRef.current) return;
      if (!tagFilterRef.current.contains(e.target as Node)) setTagFilterOpen(false);
    }
    if (tagFilterOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [tagFilterOpen]);

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
    setSearchInput(val);  // immediate visual update
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
    patch({
      q: null, resolution: null, codec: null, genre: null, tags: null,
      hdr: null, dv: null, av1Compat: null, legacy: null, noJf: null, page: '1',
    });
  }

  function resetView() {
    setSearchParams({}, { replace: true });
  }

  const hasNonDefaultView = searchParams.toString() !== '';

  const { data: statsData } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: api.stats,
    staleTime: 60_000,
  });
  const { data: genresData } = useQuery({
    queryKey: ['genres'],
    queryFn: api.genres,
    staleTime: 120_000,
  });
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: api.tags,
    staleTime: 120_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['movies', page, limit, search, resolution, codec, genre, tagFilter, hdrOnly, dvOnly, av1CompatOnly, legacyOnly, noJf, sortBy, sortDir],
    queryFn: () => api.movies({
      page, limit, sortBy, sortDir,
      ...(search ? { search } : {}),
      ...(resolution ? { resolution } : {}),
      ...((av1CompatOnly ? 'av1' : codec) ? { codec: (av1CompatOnly ? 'av1' : codec) } : {}),
      ...(genre ? { genre } : {}),
      ...(selectedTags.length > 0 ? { tags: selectedTags.join(',') } : {}),
      ...(hdrOnly ? { hdr: 'true' } : {}),
      ...(dvOnly ? { dv: 'true' } : {}),
      ...(legacyOnly ? { legacy: 'true' } : {}),
      ...(noJf ? { noJf: 'true' } : {}),
    }),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;
  const hasActiveFilter = search || resolution || codec || genre || selectedTags.length > 0 || hdrOnly || dvOnly || av1CompatOnly || legacyOnly || noJf;
  const clientProfile = (() => { try { return localStorage.getItem('clientProfile') ?? 'android_tv'; } catch { return 'android_tv'; } })();
  const av1CompatRelevant = AV1_WARN_PROFILES.has(clientProfile);
  const pageMovieIds = data?.movies.map((m: Movie) => m.id) ?? [];
  const allPageSelected = pageMovieIds.length > 0 && pageMovieIds.every(id => selectedIds.includes(id));

  const removeSelectedMutation = useMutation({
    mutationFn: (ids: number[]) => api.removeMoviesFromIndex(ids),
    onSuccess: async () => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['movies'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
  const batchTagsMutation = useMutation({
    mutationFn: (body: { ids: number[]; addTags?: string[]; removeTags?: string[] }) => api.patchMovieTagsBatch(body),
    onSuccess: async () => {
      setSelectedIds([]);
      setBatchTags([]);
      setBatchTagPick('');
      setBatchTagInput('');
      setShowAddTagsModal(false);
      setShowRemoveTagsModal(false);
      await queryClient.invalidateQueries({ queryKey: ['movies'] });
      await queryClient.invalidateQueries({ queryKey: ['movie'] });
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  function toggleSelected(id: number, checked: boolean) {
    setSelectedIds(prev => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter(x => x !== id);
    });
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedIds(prev => {
      if (checked) {
        const merged = new Set([...prev, ...pageMovieIds]);
        return Array.from(merged);
      }
      return prev.filter(id => !pageMovieIds.includes(id));
    });
  }

  async function removeSelectedFromIndex() {
    if (selectedIds.length === 0) return;
    const ok = window.confirm(`Remove ${selectedIds.length} selected item(s) from Curatarr index only? Files on disk will remain untouched.`);
    if (!ok) return;
    try {
      await removeSelectedMutation.mutateAsync(selectedIds);
    } catch {
      // no-op, existing error surfaces via disabled state + retry
    }
  }

  function removeFilterTag(tag: string) {
    const next = selectedTags.filter(t => t !== tag);
    patch({ tags: next.length > 0 ? next.join(',') : null, page: '1' });
  }

  function toggleFilterTag(tag: string) {
    const t = normalizeTag(tag);
    if (!t) return;
    if (selectedTags.includes(t)) {
      removeFilterTag(t);
      return;
    }
    patch({ tags: [...selectedTags, t].join(','), page: '1' });
  }

  function startBatchTagModal(mode: 'add' | 'remove') {
    setBatchTags([]);
    setBatchTagPick('');
    setBatchTagInput('');
    if (mode === 'add') setShowAddTagsModal(true);
    else setShowRemoveTagsModal(true);
  }

  function addBatchTag(raw: string) {
    const t = normalizeTag(raw);
    if (!t || batchTags.includes(t)) return;
    setBatchTags(prev => [...prev, t]);
  }

  async function applyBatchAddTags() {
    if (selectedIds.length === 0 || batchTags.length === 0) return;
    await batchTagsMutation.mutateAsync({ ids: selectedIds, addTags: batchTags });
  }

  async function applyBatchRemoveTags() {
    if (selectedIds.length === 0 || batchTags.length === 0) return;
    await batchTagsMutation.mutateAsync({ ids: selectedIds, removeTags: batchTags });
  }

  return (
    <div className="flex flex-col">
      {/* Filter bar — sticky so it stays at top when the table scrolls via the outer <main> */}
      <div className="sticky top-0 z-10 px-4 py-2.5 border-b flex flex-wrap items-center gap-2"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
        {isFetching && (
          <div className="absolute left-0 right-0 top-0 h-[2px] overflow-hidden">
            <div className="h-full bg-violet-500/80 animate-pulse" />
          </div>
        )}

        <h1 className="text-sm font-semibold shrink-0 mr-1" style={{ color: 'var(--c-text)' }}>Library</h1>
        <div className="w-px h-4 shrink-0" style={{ background: 'var(--c-border)' }} />

        <div className="relative px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)' }}>
          <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--c-muted)' }} />
          <input
            type="text" placeholder="Search titles…"
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            className="pl-7 pr-3 py-1.5 rounded-lg text-sm focus:outline-none w-52"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
            onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
          />
        </div>

        {/* Resolution chips */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)' }}>
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
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)' }}>
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

        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)', color: 'var(--c-muted)' }}>
          <span className="text-xs">Genre</span>
          <select
            value={genre}
            onChange={e => patch({ genre: e.target.value || null, page: '1' })}
            className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: genre ? 'var(--c-accent)' : 'var(--c-muted)' }}
          >
            <option value="">All</option>
            {(genresData?.genres ?? []).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div ref={tagFilterRef} className="relative flex items-center gap-2 text-xs px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)', color: 'var(--c-muted)' }}>
          <span>Tags</span>
          <button
            onClick={() => setTagFilterOpen(v => !v)}
            className="px-2 py-1 text-xs rounded border"
            style={{ borderColor: 'var(--c-border)', color: selectedTags.length ? '#c4b5fd' : 'var(--c-muted)' }}
          >
            {selectedTags.length > 0 ? `${selectedTags.length} selected` : 'Select tags'}
          </button>
          {tagFilterOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
              {(tagsData?.tags ?? []).length === 0 && (
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>No tags available.</div>
              )}
              {(tagsData?.tags ?? []).map(t => (
                <label key={t} className="flex items-center gap-2 text-xs cursor-pointer"
                  style={{ color: selectedTags.includes(t) ? '#d4cfff' : 'var(--c-muted)' }}>
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(t)}
                    onChange={() => toggleFilterTag(t)}
                    className="accent-violet-600"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          )}
          {selectedTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
            {selectedTags.map(t => (
              <button
                key={t}
                onClick={() => removeFilterTag(t)}
                className="px-2 py-0.5 rounded-full text-xs border"
                style={{ color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }}
                title="Remove tag filter"
              >
                {t} ×
              </button>
            ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-2 py-1 rounded-lg border"
          style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)' }}>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: 'var(--c-muted)' }}>
            <input type="checkbox" checked={hdrOnly}
              onChange={e => patch({ hdr: e.target.checked ? '1' : null, page: '1' })}
              className="accent-violet-600" />
            HDR
          </label>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: 'var(--c-muted)' }}>
            <input type="checkbox" checked={dvOnly}
              onChange={e => patch({ dv: e.target.checked ? '1' : null, page: '1' })}
              className="accent-violet-600" />
            DV
          </label>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: av1CompatOnly ? '#fbbf24' : 'var(--c-muted)' }}
            title="Show AV1 files that may require transcoding on current client profile">
            <input type="checkbox" checked={av1CompatOnly}
              onChange={e => patch({ av1Compat: e.target.checked ? '1' : null, codec: e.target.checked ? null : codec, page: '1' })}
              className="accent-violet-600" />
            AV1 compat
          </label>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: legacyOnly ? '#fb923c' : 'var(--c-muted)' }}
            title="Show legacy video codecs (MPEG-4 / MPEG-2 / MSMPEG)">
            <input type="checkbox" checked={legacyOnly}
              onChange={e => patch({ legacy: e.target.checked ? '1' : null, page: '1' })}
              className="accent-violet-600" />
            Legacy codec
          </label>

          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: 'var(--c-muted)' }}
            title="Show movies not yet matched in Jellyfin">
            <input type="checkbox" checked={noJf}
              onChange={e => patch({ noJf: e.target.checked ? '1' : null, page: '1' })}
              className="accent-violet-600" />
            No JF
          </label>
        </div>

        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="text-xs px-2 py-1 rounded border font-semibold"
            style={{ color: '#c4b5fd', borderColor: 'var(--c-border)', background: 'rgba(124,58,237,0.12)' }}>
            clear filters
          </button>
        )}
        {hasNonDefaultView && (
          <button
            onClick={resetView}
            className="text-xs px-2 py-1 rounded border font-semibold"
            style={{ color: '#ddd6fe', borderColor: 'rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.2)' }}
            title="Reset all filters, sort, and page to defaults">
            reset view
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
          {av1CompatOnly && av1CompatRelevant && (
            <>
              <span className="text-amber-400" title={`Profile ${clientProfile.replace('_', ' ')} may not hardware-decode AV1`}>
                ⚠ transcode-prone
              </span>
              <span style={{ color: 'var(--c-border)' }}>·</span>
            </>
          )}
          {selectedIds.length > 0 && (
            <>
              <button
                onClick={() => startBatchTagModal('add')}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--c-border)', color: '#a7f3d0', background: 'rgba(16,185,129,0.12)' }}
                title="Batch-add tags to selected rows">
                Tags + ({selectedIds.length})
              </button>
              <button
                onClick={() => startBatchTagModal('remove')}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(239,68,68,0.1)' }}
                title="Batch-remove tags from selected rows">
                Tags -
              </button>
              <button
                onClick={removeSelectedFromIndex}
                disabled={removeSelectedMutation.isPending}
                className="px-2 py-1 rounded border text-xs disabled:opacity-60"
                style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
                title="Remove selected rows from Curatarr DB only (files untouched)">
                {removeSelectedMutation.isPending ? 'Removing…' : `Remove ${selectedIds.length}`}
              </button>
              <span style={{ color: 'var(--c-border)' }}>·</span>
            </>
          )}
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
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>Loading…</div>
        ) : !data?.movies.length ? (
          <div className="p-8 text-sm" style={{ color: 'var(--c-muted)' }}>
            {hasActiveFilter
              ? 'No movies match the current filters.'
              : statsData?.totalMovies === 0
                ? 'No movies scanned yet — go to Scan & Sync to analyse your library.'
                : 'No movies found.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-[41px] z-[5]" style={{ background: 'var(--c-bg)' }}>
              <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
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
                <SortHeader field="title"  label="Title"  current={sortBy} dir={sortDir} onChange={handleSort} />
                <SortHeader field="year"   label="Year"   current={sortBy} dir={sortDir} onChange={handleSort} />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>Quality</th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>HDR</th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-left"
                  style={{ color: 'var(--c-muted)' }}>Group</th>
                <SortHeader field="rating" label="Critic"  current={sortBy} dir={sortDir} onChange={handleSort} align="right" />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-right"
                  style={{ color: 'var(--c-muted)' }}
                  title="IMDb community rating (0–10) from Jellyfin CommunityRating">IMDb</th>
                <SortHeader field="size"   label="Size"   current={sortBy} dir={sortDir} onChange={handleSort} align="right" />
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center"
                  style={{ color: 'var(--c-muted)', minWidth: '72px' }}
                  title="Quality analytics — populated after Deep Verify. FLAG = playback issue. WARN = quality concern. Click badge for details + docs.">
                  Issues
                </th>
                <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-center w-20"
                  style={{ color: 'var(--c-muted)' }}
                  title="Left dot: scan status (green=ok, orange=verify failed, red=error, yellow=pending, gray=not scanned)&#10;Right dot: Jellyfin sync (purple=matched, gray=not matched)">
                  Status
                </th>
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
                  <td className="px-2 py-2 text-center">
                    <label className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                      style={{ minWidth: 28, minHeight: 28 }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(m.id)}
                        onChange={e => toggleSelected(m.id, e.target.checked)}
                        onClick={e => e.stopPropagation()}
                        className="w-5 h-5 accent-violet-600 cursor-pointer"
                        title="Select row"
                      />
                    </label>
                  </td>
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
                  <td className="px-3 py-2 text-right">
                    <CriticScoreBadge score={m.critic_rating} />
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
        <div className="px-4 py-2.5 border-t flex items-center justify-center text-sm"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => patch({ page: String(Math.max(1, page - 1)) })}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-sm disabled:opacity-40"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
            >
              <ChevronLeft size={13} /> Previous
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
        </div>
      )}

      {showAddTagsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddTagsModal(false)} />
          <div className="relative w-[560px] max-w-[92vw] rounded-xl border p-4 space-y-3"
            style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Add Tags to {selectedIds.length} Selected Movies
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={batchTagPick}
                onChange={e => setBatchTagPick(e.target.value)}
                className="px-2 py-1 rounded text-xs focus:outline-none min-w-[11rem]"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              >
                <option value="">Select existing tag</option>
                {(tagsData?.tags ?? []).filter(t => !batchTags.includes(t)).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={() => { addBatchTag(batchTagPick); setBatchTagPick(''); }}
                disabled={!batchTagPick}
                className="px-2 py-1 text-xs rounded border disabled:opacity-40"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                Add
              </button>
              <input
                value={batchTagInput}
                onChange={e => setBatchTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addBatchTag(batchTagInput); setBatchTagInput(''); } }}
                placeholder="new tag"
                className="px-2 py-1 rounded text-xs focus:outline-none"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
              <button
                onClick={() => { addBatchTag(batchTagInput); setBatchTagInput(''); }}
                disabled={!batchTagInput.trim()}
                className="px-2 py-1 text-xs rounded border disabled:opacity-40"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                Add new
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-6">
              {batchTags.map(t => (
                <button key={t}
                  onClick={() => setBatchTags(prev => prev.filter(x => x !== t))}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{ color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }}>
                  {t} ×
                </button>
              ))}
              {batchTags.length === 0 && <span className="text-xs" style={{ color: 'var(--c-muted)' }}>No tags selected.</span>}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddTagsModal(false)}
                className="px-3 py-1.5 rounded text-xs border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={applyBatchAddTags}
                disabled={batchTags.length === 0 || batchTagsMutation.isPending}
                className="px-3 py-1.5 rounded text-xs border disabled:opacity-40"
                style={{ borderColor: 'rgba(16,185,129,0.45)', color: '#a7f3d0', background: 'rgba(16,185,129,0.12)' }}
              >
                {batchTagsMutation.isPending ? 'Applying…' : 'Apply Tags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemoveTagsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRemoveTagsModal(false)} />
          <div className="relative w-[560px] max-w-[92vw] rounded-xl border p-4 space-y-3"
            style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Remove Tags from {selectedIds.length} Selected Movies
            </div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Select existing tags and keep adding them to the remove list.
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={batchTagPick}
                onChange={e => setBatchTagPick(e.target.value)}
                className="px-2 py-1 rounded text-xs focus:outline-none min-w-[11rem]"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              >
                <option value="">Select existing tag</option>
                {(tagsData?.tags ?? []).filter(t => !batchTags.includes(t)).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={() => { addBatchTag(batchTagPick); setBatchTagPick(''); }}
                disabled={!batchTagPick}
                className="px-2 py-1 text-xs rounded border disabled:opacity-40"
                style={{ borderColor: 'var(--c-border)', color: '#fca5a5' }}
              >
                Add to remove list
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-6">
              {batchTags.map(t => (
                <button key={t}
                  onClick={() => setBatchTags(prev => prev.filter(x => x !== t))}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }}>
                  {t} ×
                </button>
              ))}
              {batchTags.length === 0 && <span className="text-xs" style={{ color: 'var(--c-muted)' }}>No tags selected for removal.</span>}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRemoveTagsModal(false)}
                className="px-3 py-1.5 rounded text-xs border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={applyBatchRemoveTags}
                disabled={batchTags.length === 0 || batchTagsMutation.isPending}
                className="px-3 py-1.5 rounded text-xs border disabled:opacity-40"
                style={{ borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
              >
                {batchTagsMutation.isPending ? 'Applying…' : 'Remove Tags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedId && (
        <MovieDetailDrawer movieId={selectedId} onClose={() => patch({ movie: null })} />
      )}
    </div>
  );
}
