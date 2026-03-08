import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Movie, type Stats, api } from '../api/client';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer';
import { LibraryFilterBar } from '../components/library/LibraryFilterBar';
import { LibraryPagination } from '../components/library/LibraryPagination';
import { LibraryTable } from '../components/library/LibraryTable';
import { RemoveIndexModal } from '../components/library/RemoveIndexModal';
import { TagBatchModal } from '../components/library/TagBatchModal';
import {
  formatSize,
  getSearchParam,
  getSearchParamInteger,
  normalizeTag,
  persistedFilterParams,
  toSortDirection,
  toSortField,
} from '../components/library/helpers';
import { AV1_WARN_PROFILES } from '../components/library/types';

export function Library() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const pageRaw = getSearchParamInteger(searchParams, 'page', 1);
  const limitParam = getSearchParam(searchParams, 'limit', '50');
  const limitRaw = getSearchParamInteger(searchParams, 'limit', 50);
  const sortBy = toSortField(searchParams.get('sort'));
  const sortDir = toSortDirection(searchParams.get('dir'));
  const resolution = getSearchParam(searchParams, 'resolution', '');
  const codec = getSearchParam(searchParams, 'codec', '');
  const audioFormat = getSearchParam(searchParams, 'audioFormat', '');
  const audioLayout = getSearchParam(searchParams, 'audioLayout', '');
  const genreFilter = getSearchParam(searchParams, 'genre', '');
  const genreAnd = searchParams.get('genreAnd') === '1';
  const selectedGenres = genreFilter
    ? genreFilter
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  const hdrOnly = searchParams.get('hdr') === '1';
  const dvOnly = searchParams.get('dv') === '1';
  const av1CompatOnly = searchParams.get('av1Compat') === '1';
  const legacyOnly = searchParams.get('legacy') === '1';
  const noJf = searchParams.get('noJf') === '1';
  const multiOnly = searchParams.get('multi') === '1';
  const tagFilter = getSearchParam(searchParams, 'tags', '');
  const selectedTags = tagFilter
    ? tagFilter
        .split(',')
        .map((t) => normalizeTag(t))
        .filter(Boolean)
    : [];
  const search = getSearchParam(searchParams, 'q', '');
  const showAll = limitParam === 'all' || searchParams.get('all') === '1';
  const page = Math.max(1, pageRaw);
  const limit = showAll ? 50 : Math.max(1, limitRaw);
  const selectedId = getSearchParamInteger(searchParams, 'movie', 0) || undefined;

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredInitialParamsRef = useRef(false);
  const tagFilterRef = useRef<HTMLDivElement | null>(null);
  const genreFilterRef = useRef<HTMLDivElement | null>(null);

  const [searchInput, setSearchInput] = useState(search);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);
  const [genreFilterOpen, setGenreFilterOpen] = useState(false);
  const [showAddTagsModal, setShowAddTagsModal] = useState(false);
  const [showRemoveTagsModal, setShowRemoveTagsModal] = useState(false);
  const [showRemoveIndexModal, setShowRemoveIndexModal] = useState(false);
  const [batchTagPick, setBatchTagPick] = useState('');
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchTags, setBatchTags] = useState<string[]>([]);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (tagFilterRef.current && !tagFilterRef.current.contains(e.target as Node)) setTagFilterOpen(false);
      if (genreFilterRef.current && !genreFilterRef.current.contains(e.target as Node)) setGenreFilterOpen(false);
    }
    if (tagFilterOpen || genreFilterOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [tagFilterOpen, genreFilterOpen]);

  useEffect(() => {
    if (restoredInitialParamsRef.current) return;
    restoredInitialParamsRef.current = true;

    if (searchParams.get('reset') === '1') {
      sessionStorage.removeItem('curatarr:libraryParams');
      setSearchParams({}, { replace: true });
      return;
    }
    if (!searchParams.toString()) {
      const saved = sessionStorage.getItem('curatarr:libraryParams');
      if (saved) setSearchParams(new URLSearchParams(saved), { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const p = persistedFilterParams(searchParams).toString();
    if (p) sessionStorage.setItem('curatarr:libraryParams', p);
    else sessionStorage.removeItem('curatarr:libraryParams');
  }, [searchParams]);

  function patch(changes: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }

  function handleSearchInput(val: string) {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      patch({ q: val, page: '1' });
    }, 300);
  }

  function handleSort(field: 'quality' | 'title' | 'year' | 'rating' | 'size') {
    if (sortBy === field) {
      patch({ dir: sortDir === 'asc' ? 'desc' : 'asc', page: '1' });
    } else {
      patch({ sort: field, dir: field === 'quality' ? 'desc' : 'asc', page: '1' });
    }
  }

  function resetView() {
    const next = new URLSearchParams();
    const currentLimit = searchParams.get('limit');
    const currentShowAll = searchParams.get('all');
    if (currentLimit) next.set('limit', currentLimit);
    if (currentShowAll === '1') next.set('all', '1');
    setSearchParams(next, { replace: true });
  }

  const hasActiveFilter = Boolean(
    search ||
      resolution ||
      codec ||
      audioFormat ||
      audioLayout ||
      selectedGenres.length > 0 ||
      genreAnd ||
      selectedTags.length > 0 ||
      hdrOnly ||
      dvOnly ||
      av1CompatOnly ||
      legacyOnly ||
      noJf ||
      multiOnly,
  );
  const hasNonDefaultView = hasActiveFilter;

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
    queryKey: [
      'movies',
      page,
      limit,
      showAll,
      search,
      resolution,
      codec,
      audioFormat,
      audioLayout,
      genreFilter,
      genreAnd,
      tagFilter,
      hdrOnly,
      dvOnly,
      av1CompatOnly,
      legacyOnly,
      noJf,
      multiOnly,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      api.movies({
        page: showAll ? 1 : page,
        limit: showAll ? 100000 : limit,
        sortBy,
        sortDir,
        ...(search ? { search } : {}),
        ...(resolution ? { resolution } : {}),
        ...((av1CompatOnly ? 'av1' : codec) ? { codec: av1CompatOnly ? 'av1' : codec } : {}),
        ...(audioFormat ? { audioFormat } : {}),
        ...(audioLayout ? { audioLayout } : {}),
        ...(selectedGenres.length > 0 ? { genre: selectedGenres.join(',') } : {}),
        ...(genreAnd ? { genreAnd: 'true' } : {}),
        ...(selectedTags.length > 0 ? { tags: selectedTags.join(',') } : {}),
        ...(hdrOnly ? { hdr: 'true' } : {}),
        ...(dvOnly ? { dv: 'true' } : {}),
        ...(legacyOnly ? { legacy: 'true' } : {}),
        ...(noJf ? { noJf: 'true' } : {}),
        ...(multiOnly ? { multi: 'true' } : {}),
        ...(showAll ? { showAll: 'true' } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const totalPages = showAll ? 1 : data ? Math.ceil(data.total / limit) : 1;
  const clientProfile = (() => {
    try {
      return localStorage.getItem('clientProfile') ?? 'android_tv';
    } catch {
      return 'android_tv';
    }
  })();
  const av1CompatRelevant = AV1_WARN_PROFILES.has(clientProfile);
  const pageMovieIds = data?.movies.map((m: Movie) => m.id) ?? [];
  const allPageSelected = pageMovieIds.length > 0 && pageMovieIds.every((id) => selectedIds.includes(id));

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
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        const merged = new Set([...prev, ...pageMovieIds]);
        return Array.from(merged);
      }
      return prev.filter((id) => !pageMovieIds.includes(id));
    });
  }

  function removeFilterTag(tag: string) {
    const next = selectedTags.filter((t) => t !== tag);
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

  function removeGenreFilter(genre: string) {
    const next = selectedGenres.filter((g) => g !== genre);
    patch({
      genre: next.length > 0 ? next.join(',') : null,
      genreAnd: next.length > 1 ? (genreAnd ? '1' : null) : null,
      page: '1',
    });
  }

  function toggleGenreFilter(genre: string) {
    const g = genre.trim();
    if (!g) return;
    if (selectedGenres.includes(g)) {
      removeGenreFilter(g);
      return;
    }
    const next = [...selectedGenres, g];
    patch({
      genre: next.join(','),
      genreAnd: next.length > 1 ? (genreAnd ? '1' : null) : null,
      page: '1',
    });
  }

  function addBatchTag(raw: string) {
    const t = normalizeTag(raw);
    if (!t || batchTags.includes(t)) return;
    setBatchTags((prev) => [...prev, t]);
  }

  function addPickedTag() {
    addBatchTag(batchTagPick);
    setBatchTagPick('');
  }

  function addInputTag() {
    addBatchTag(batchTagInput);
    setBatchTagInput('');
  }

  async function applyBatchAddTags() {
    if (selectedIds.length === 0 || batchTags.length === 0) return;
    await batchTagsMutation.mutateAsync({ ids: selectedIds, addTags: batchTags });
  }

  async function applyBatchRemoveTags() {
    if (selectedIds.length === 0 || batchTags.length === 0) return;
    await batchTagsMutation.mutateAsync({ ids: selectedIds, removeTags: batchTags });
  }

  function resetBatchTagState() {
    setBatchTags([]);
    setBatchTagPick('');
    setBatchTagInput('');
  }

  function openAddTagsModal() {
    resetBatchTagState();
    setShowAddTagsModal(true);
  }

  function openRemoveTagsModal() {
    resetBatchTagState();
    setShowRemoveTagsModal(true);
  }

  function removeSelectedFromIndex() {
    if (selectedIds.length === 0) return;
    setShowRemoveIndexModal(true);
  }

  async function confirmRemoveSelectedFromIndex() {
    if (selectedIds.length === 0) return;
    try {
      await removeSelectedMutation.mutateAsync(selectedIds);
      setShowRemoveIndexModal(false);
    } catch {
      // no-op
    }
  }

  return (
    <div className="flex flex-col h-full">
      <LibraryFilterBar
        isFetching={isFetching}
        searchInput={searchInput}
        onSearchInput={handleSearchInput}
        genreFilterRef={genreFilterRef}
        genreFilterOpen={genreFilterOpen}
        setGenreFilterOpen={setGenreFilterOpen}
        genres={genresData?.genres ?? []}
        selectedGenres={selectedGenres}
        genreAnd={genreAnd}
        onToggleGenreFilter={toggleGenreFilter}
        onToggleGenreAnd={(checked) => patch({ genreAnd: checked ? '1' : null, page: '1' })}
        onRemoveGenreFilter={removeGenreFilter}
        resolution={resolution}
        onToggleResolution={(value) => patch({ resolution: resolution === value ? null : value, page: '1' })}
        codec={codec}
        onToggleCodec={(value) => patch({ codec: codec === value ? null : value, page: '1' })}
        hdrOnly={hdrOnly}
        onToggleHdrOnly={(checked) => patch({ hdr: checked ? '1' : null, page: '1' })}
        dvOnly={dvOnly}
        onToggleDvOnly={(checked) => patch({ dv: checked ? '1' : null, page: '1' })}
        av1CompatOnly={av1CompatOnly}
        onToggleAv1CompatOnly={(checked) =>
          patch({ av1Compat: checked ? '1' : null, codec: checked ? null : codec, page: '1' })
        }
        legacyOnly={legacyOnly}
        onToggleLegacyOnly={(checked) => patch({ legacy: checked ? '1' : null, page: '1' })}
        audioFormat={audioFormat}
        onAudioFormatChange={(value) => patch({ audioFormat: value || null, page: '1' })}
        audioLayout={audioLayout}
        onAudioLayoutChange={(value) => patch({ audioLayout: value || null, page: '1' })}
        tagFilterRef={tagFilterRef}
        tagFilterOpen={tagFilterOpen}
        setTagFilterOpen={setTagFilterOpen}
        tags={tagsData?.tags ?? []}
        selectedTags={selectedTags}
        onToggleFilterTag={toggleFilterTag}
        onRemoveFilterTag={removeFilterTag}
        multiOnly={multiOnly}
        onToggleMultiOnly={(checked) => patch({ multi: checked ? '1' : null, page: '1' })}
        noJf={noJf}
        onToggleNoJf={(checked) => patch({ noJf: checked ? '1' : null, page: '1' })}
        showAll={showAll}
        limit={limit}
        onPageSizeChange={(value) => {
          if (value === 'all') patch({ limit: 'all', all: '1', page: '1' });
          else patch({ limit: value, all: null, page: '1' });
        }}
        hasNonDefaultView={hasNonDefaultView}
        onResetView={resetView}
        av1CompatRelevant={av1CompatRelevant}
        clientProfile={clientProfile}
        selectedCount={selectedIds.length}
        onOpenAddTagsModal={openAddTagsModal}
        onOpenRemoveTagsModal={openRemoveTagsModal}
        onRemoveSelectedFromIndex={removeSelectedFromIndex}
        removePending={removeSelectedMutation.isPending}
        totalMovies={data?.total}
        totalLibrarySize={data?.totalSize}
      />

      <div className="px-6 py-4 space-y-4">
        <div className="overflow-x-auto">
          <LibraryTable
            isLoading={isLoading}
            movies={data?.movies ?? []}
            hasActiveFilter={hasActiveFilter}
            totalMovies={statsData?.totalMovies}
            selectedId={selectedId}
            selectedIds={selectedIds}
            allPageSelected={allPageSelected}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            onToggleSelectAllOnPage={toggleSelectAllOnPage}
            onToggleSelected={toggleSelected}
            onToggleMovieDrawer={(id) => patch({ movie: selectedId === id ? null : String(id) })}
            formatSize={formatSize}
          />
        </div>

        {!showAll && (
          <LibraryPagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={data?.total ?? 0}
            onChangePage={(next) => patch({ page: String(next) })}
          />
        )}
      </div>

      <TagBatchModal
        mode="add"
        selectedCount={selectedIds.length}
        allTags={tagsData?.tags ?? []}
        pending={batchTagsMutation.isPending}
        open={showAddTagsModal}
        tagPick={batchTagPick}
        tagInput={batchTagInput}
        batchTags={batchTags}
        onClose={() => setShowAddTagsModal(false)}
        onTagPickChange={setBatchTagPick}
        onTagInputChange={setBatchTagInput}
        onAddPicked={addPickedTag}
        onAddInput={addInputTag}
        onRemoveBatchTag={(tag) => setBatchTags((prev) => prev.filter((x) => x !== tag))}
        onApply={applyBatchAddTags}
      />

      <TagBatchModal
        mode="remove"
        selectedCount={selectedIds.length}
        allTags={tagsData?.tags ?? []}
        pending={batchTagsMutation.isPending}
        open={showRemoveTagsModal}
        tagPick={batchTagPick}
        tagInput={batchTagInput}
        batchTags={batchTags}
        onClose={() => setShowRemoveTagsModal(false)}
        onTagPickChange={setBatchTagPick}
        onTagInputChange={setBatchTagInput}
        onAddPicked={addPickedTag}
        onAddInput={addInputTag}
        onRemoveBatchTag={(tag) => setBatchTags((prev) => prev.filter((x) => x !== tag))}
        onApply={applyBatchRemoveTags}
      />

      <RemoveIndexModal
        open={showRemoveIndexModal}
        selectedCount={selectedIds.length}
        pending={removeSelectedMutation.isPending}
        onClose={() => setShowRemoveIndexModal(false)}
        onConfirm={confirmRemoveSelectedFromIndex}
      />

      {selectedId && <MovieDetailDrawer movieId={selectedId} onClose={() => patch({ movie: null })} />}
    </div>
  );
}
