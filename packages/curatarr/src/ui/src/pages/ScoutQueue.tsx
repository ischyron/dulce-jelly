import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Search, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { type Candidate, api } from '../api/client';
import { InfoHint } from '../components/InfoHint';
import { MovieDetailDrawer } from '../components/MovieDetailDrawer';
import {
  AudioQualityBadges,
  CodecBadge,
  CriticScoreBadge,
  HdrBadge,
  ResolutionBadge,
} from '../components/QualityBadge';
import {
  AUDIO_FORMAT_OPTIONS,
  AUDIO_LAYOUT_OPTIONS,
  CODEC_OPTIONS,
  RESOLUTION_OPTIONS,
} from '../components/library/types';
import { BatchConfirmModal } from '../components/scout-queue/BatchConfirmModal';
import { CompatTag } from '../components/scout-queue/CompatTag';
import { FilterSection } from '../components/shared/FilterSection';
import { FILTER_TOKENS } from '../components/shared/filterTokens';
import { getCodecDescription } from '../components/shared/utils';

function isSurfaceToggleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return (
    target.closest('button, input, select, textarea, a, label, [role="button"], [role="link"], [role="checkbox"]') ===
    null
  );
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function clampBatchSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '10', 10);
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
  const seedMinCritic = Number.parseFloat(settings.scoutPipelineMinCritic ?? '65');
  const seedMinComm = Number.parseFloat(settings.scoutPipelineMinImdb ?? '7.0');
  const maxBatch = clampBatchSize(settings.scoutPipelineBatchSize);

  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [selectedBatch, setSelectedBatch] = useState<number[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchUiError, setBatchUiError] = useState<string>('');
  const [batchResultMsg, setBatchResultMsg] = useState<string>('');
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qMinCritic = searchParams.get('criticScoreMin') ?? searchParams.get('minCritic');
  const qMinCommunity = searchParams.get('imdbScoreMin') ?? searchParams.get('minCommunity');
  const q = searchParams.get('q') ?? '';
  const resolution = searchParams.get('resolution') ?? '';
  const codec = searchParams.get('codec') ?? '';
  const audioFormat = searchParams.get('audioFormat') ?? '';
  const audioLayout = searchParams.get('audioLayout') ?? '';
  const hdrOnly = searchParams.get('hdr') === '1';
  const dvOnly = searchParams.get('dv') === '1';
  const av1CompatOnly = searchParams.get('av1Compat') === '1';
  const legacyOnly = searchParams.get('legacy') === '1';
  const noJf = searchParams.get('noJf') === '1';
  const multiOnly = searchParams.get('multi') === '1';
  const releaseGroup = searchParams.get('releaseGroup') ?? '';
  const qGenre = searchParams.get('genre');
  const genreAnd = searchParams.get('genreAnd') === '1';
  const qTags = searchParams.get('tags');

  // Resolved values (URL overrides seeded defaults)
  const effMinCritic = qMinCritic != null ? Number(qMinCritic) : seedMinCritic;
  const effMinComm = qMinCommunity != null ? Number(qMinCommunity) : seedMinComm;
  const effGenre = qGenre ?? '';
  const selectedGenres = effGenre
    ? effGenre
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  const selectedTags = qTags
    ? qTags
        .split(',')
        .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean)
    : [];
  const genreRef = useRef<HTMLDivElement | null>(null);
  const tagRef = useRef<HTMLDivElement | null>(null);
  const [genreOpen, setGenreOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) setGenreOpen(false);
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
    }
    if (genreOpen || tagOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [genreOpen, tagOpen]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  function patch(changes: Record<string, string | null>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v == null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }

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
  const { data: releaseGroupsData } = useQuery({
    queryKey: ['release-groups'],
    queryFn: api.releaseGroups,
    staleTime: 120_000,
  });

  function handleSearchInput(val: string) {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      patch({ q: val });
    }, 300);
  }

  const genreKey = selectedGenres.join(',');
  const tagKey = selectedTags.join(',');
  const { data, isLoading } = useQuery({
    queryKey: [
      'candidates',
      q,
      effMinCritic,
      effMinComm,
      resolution,
      codec,
      audioFormat,
      audioLayout,
      genreKey,
      genreAnd,
      tagKey,
      hdrOnly,
      dvOnly,
      av1CompatOnly,
      legacyOnly,
      noJf,
      multiOnly,
      releaseGroup,
    ],
    queryFn: () =>
      api.candidates({
        criticScoreMin: effMinCritic,
        imdbScoreMin: effMinComm,
        ...(q ? { search: q } : {}),
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
        ...(releaseGroup ? { releaseGroup } : {}),
        all: '1',
      }),
    enabled: Number.isFinite(effMinCritic) && Number.isFinite(effMinComm),
  });

  function removeGenreFilter(genre: string) {
    const next = selectedGenres.filter((g) => g !== genre);
    patch({
      genre: next.length > 0 ? next.join(',') : null,
      genreAnd: next.length > 1 ? (genreAnd ? '1' : null) : null,
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
    });
  }

  function removeTagFilter(tag: string) {
    const next = selectedTags.filter((t) => t !== tag);
    patch({ tags: next.length > 0 ? next.join(',') : null });
  }

  function toggleTagFilter(rawTag: string) {
    const tag = rawTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag) return;
    if (selectedTags.includes(tag)) {
      removeTagFilter(tag);
      return;
    }
    patch({ tags: [...selectedTags, tag].join(',') });
  }

  const hasFilterOverrides =
    qMinCritic !== null ||
    qMinCommunity !== null ||
    q ||
    resolution ||
    codec ||
    audioFormat ||
    audioLayout ||
    qGenre !== null ||
    genreAnd ||
    qTags !== null ||
    hdrOnly ||
    dvOnly ||
    av1CompatOnly ||
    legacyOnly ||
    noJf ||
    multiOnly ||
    releaseGroup;

  const candidateById = useMemo(() => {
    const map = new Map<number, Candidate>();
    for (const c of data?.candidates ?? []) map.set(c.id, c);
    return map;
  }, [data?.candidates]);

  const selectedRows = selectedBatch
    .map((id) => candidateById.get(id))
    .filter((v): v is Candidate => Boolean(v))
    .slice(0, 10);
  const pageCandidateIds = data?.candidates.map((c: Candidate) => c.id) ?? [];
  const allPageSelected = pageCandidateIds.length > 0 && pageCandidateIds.every((id) => selectedBatch.includes(id));

  const batchMutation = useMutation({
    mutationFn: (movieIds: number[]) => api.scoutSearchBatch({ movieIds, batchSize: movieIds.length }),
    onSuccess: (res) => {
      const errors = res.results.filter((r) => r.error).length;
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
    setSelectedBatch((prev) => {
      if (!checked) return prev.filter((id) => id !== movieId);
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
    setSelectedBatch((prev) => {
      if (checked) {
        const merged = Array.from(new Set([...prev, ...pageCandidateIds]));
        if (merged.length > maxBatch) {
          setBatchUiError(`Max batch size reached (${maxBatch}).`);
          return merged.slice(0, maxBatch);
        }
        return merged;
      }
      return prev.filter((id) => !pageCandidateIds.includes(id));
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div
        className="px-6 py-3 border-b flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:gap-x-3 shrink-0"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <h1
          className="text-base font-semibold shrink-0 flex items-center gap-2 h-8 w-full sm:w-auto order-1 self-center"
          style={{ color: 'var(--c-text)' }}
        >
          <Bot size={17} style={{ color: 'var(--c-accent)' }} />
          Scout Queue
        </h1>

        <div className="relative w-full sm:w-auto order-1">
          <input
            type="text"
            aria-label="Search titles"
            placeholder="Search titles…"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm focus:outline-none w-full sm:w-56 lg:w-64"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>

        <FilterSection label="Scout Minimums" className="text-xs w-full xl:w-auto order-2">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="text-xs flex items-center gap-1"
              htmlFor="scout-min-critic-score"
              style={{ color: 'var(--c-muted)' }}
            >
              Critic Score
              <InfoHint
                label="Critic score filter info"
                text="Jellyfin critic score (0–100). Set to 0 to include items even when critic score metadata is missing."
              />
            </label>
            <input
              id="scout-min-critic-score"
              type="number"
              min={0}
              max={100}
              value={effMinCritic}
              onChange={(e) => patch({ criticScoreMin: e.target.value, minCritic: null })}
              className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />

            <span style={{ color: 'var(--c-border)' }}>·</span>

            <label className="text-xs" htmlFor="scout-min-imdb" style={{ color: 'var(--c-muted)' }}>
              Min IMDb
            </label>
            <input
              id="scout-min-imdb"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={effMinComm}
              onChange={(e) => patch({ imdbScoreMin: e.target.value, minCommunity: null })}
              className="w-16 px-2 py-1 rounded text-sm focus:outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>
        </FilterSection>

        <FilterSection
          ref={genreRef}
          label={FILTER_TOKENS.genre.label}
          className="relative text-xs w-full xl:w-auto order-2"
          onClick={(e) => {
            if (isSurfaceToggleTarget(e.target)) setGenreOpen((v) => !v);
          }}
        >
          <button
            type="button"
            onClick={() => setGenreOpen((v) => !v)}
            aria-expanded={genreOpen}
            aria-haspopup="listbox"
            className="px-2 py-1 rounded text-xs focus:outline-none"
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              color: selectedGenres.length > 0 ? 'var(--c-accent)' : 'var(--c-muted)',
            }}
          >
            {selectedGenres.length > 0 ? `${selectedGenres.length} selected` : FILTER_TOKENS.genre.select}
          </button>
          {selectedGenres.length > 1 && (
            <label className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide cursor-pointer">
              <input
                type="checkbox"
                checked={genreAnd}
                onChange={(e) => patch({ genreAnd: e.target.checked ? '1' : null })}
                className="accent-violet-600"
              />
              AND
            </label>
          )}
          {genreOpen && (
            <div
              className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
            >
              {(genresData?.genres ?? []).length === 0 && (
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {FILTER_TOKENS.genre.noOptions}
                </div>
              )}
              {(genresData?.genres ?? []).map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                  style={{ color: selectedGenres.includes(g) ? '#d4cfff' : 'var(--c-muted)' }}
                >
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
              {selectedGenres.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => removeGenreFilter(g)}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{
                    color: '#c4b5fd',
                    borderColor: 'rgba(124,58,237,0.35)',
                    background: 'rgba(124,58,237,0.12)',
                  }}
                  aria-label={`Remove ${g} filter`}
                >
                  {g} ×
                </button>
              ))}
            </div>
          )}
        </FilterSection>

        <FilterSection label="Resolution" className="text-xs w-full xl:w-auto order-2">
          {RESOLUTION_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => patch({ resolution: resolution === item ? null : item })}
              className="px-2 py-1 text-xs rounded border transition-colors"
              style={
                resolution === item
                  ? { background: 'var(--c-accent)', borderColor: 'var(--c-accent)', color: 'white' }
                  : { borderColor: 'var(--c-border)', color: 'var(--c-muted)' }
              }
            >
              {item}
            </button>
          ))}
        </FilterSection>

        <FilterSection
          ref={tagRef}
          label={FILTER_TOKENS.tags.label}
          labelTone="pink"
          className="relative text-xs w-full xl:w-auto order-2"
          onClick={(e) => {
            if (isSurfaceToggleTarget(e.target)) setTagOpen((v) => !v);
          }}
        >
          <button
            type="button"
            onClick={() => setTagOpen((v) => !v)}
            aria-expanded={tagOpen}
            aria-haspopup="listbox"
            className="px-2 py-1 rounded text-xs focus:outline-none"
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              color: selectedTags.length > 0 ? 'var(--c-accent)' : 'var(--c-muted)',
            }}
          >
            {selectedTags.length > 0 ? `${selectedTags.length} selected` : FILTER_TOKENS.tags.select}
          </button>
          {tagOpen && (
            <div
              className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
            >
              {(tagsData?.tags ?? []).length === 0 && (
                <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {FILTER_TOKENS.tags.noOptions}
                </div>
              )}
              {(tagsData?.tags ?? []).map((tag) => (
                <label
                  key={tag}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                  style={{ color: selectedTags.includes(tag) ? '#d4cfff' : 'var(--c-muted)' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag)}
                    onChange={() => toggleTagFilter(tag)}
                    className="accent-violet-600"
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          )}
          {selectedTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTagFilter(tag)}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{
                    color: '#c4b5fd',
                    borderColor: 'rgba(124,58,237,0.35)',
                    background: 'rgba(124,58,237,0.12)',
                  }}
                  aria-label={`Remove ${tag} filter`}
                >
                  {tag} ×
                </button>
              ))}
            </div>
          )}
        </FilterSection>

        <FilterSection label="Group" className="text-xs w-full xl:w-auto order-2" style={{ color: 'var(--c-muted)' }}>
          <select
            value={releaseGroup}
            onChange={(e) => patch({ releaseGroup: e.target.value || null })}
            aria-label="Release group filter"
            className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              color: releaseGroup ? 'var(--c-accent)' : 'var(--c-muted)',
            }}
          >
            <option value="">All groups</option>
            {(releaseGroupsData?.releaseGroups ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </FilterSection>

        <FilterSection label="Flags" className="w-full xl:w-auto order-2" style={{ color: 'var(--c-muted)' }}>
          <label
            className="inline-flex items-center gap-1 text-xs leading-none h-6 cursor-pointer"
            style={{ color: 'var(--c-muted)' }}
          >
            <input
              type="checkbox"
              checked={multiOnly}
              onChange={(e) => patch({ multi: e.target.checked ? '1' : null })}
              className="accent-violet-600"
            />
            Multi-file
          </label>
          <label
            className="inline-flex items-center gap-1 text-xs leading-none h-6 cursor-pointer"
            style={{ color: 'var(--c-muted)' }}
          >
            <input
              type="checkbox"
              checked={noJf}
              onChange={(e) => patch({ noJf: e.target.checked ? '1' : null })}
              className="accent-violet-600"
            />
            Jellyfin Sync Needed
          </label>
        </FilterSection>

        <FilterSection label={FILTER_TOKENS.video.label} className="text-xs w-fit max-w-full order-4">
          {CODEC_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => patch({ codec: codec === item ? null : item, av1Compat: null })}
              className="px-2 py-1 text-xs rounded border transition-colors"
              title={getCodecDescription(item)}
              style={
                codec === item && !av1CompatOnly
                  ? { background: 'var(--c-accent)', borderColor: 'var(--c-accent)', color: 'white' }
                  : { borderColor: 'var(--c-border)', color: 'var(--c-muted)' }
              }
            >
              {item.toUpperCase()}
            </button>
          ))}
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <label className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--c-muted)' }}>
            <input
              type="checkbox"
              checked={hdrOnly}
              onChange={(e) => patch({ hdr: e.target.checked ? '1' : null })}
              className="accent-violet-600"
            />
            HDR
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--c-muted)' }}>
            <input
              type="checkbox"
              checked={dvOnly}
              onChange={(e) => patch({ dv: e.target.checked ? '1' : null })}
              className="accent-violet-600"
            />
            {FILTER_TOKENS.video.dv}
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--c-muted)' }}>
            <input
              type="checkbox"
              checked={av1CompatOnly}
              onChange={(e) => patch({ av1Compat: e.target.checked ? '1' : null, codec: null })}
              className="accent-violet-600"
            />
            {FILTER_TOKENS.video.av1Compat}
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer" style={{ color: 'var(--c-muted)' }}>
            <input
              type="checkbox"
              checked={legacyOnly}
              onChange={(e) => patch({ legacy: e.target.checked ? '1' : null })}
              className="accent-violet-600"
            />
            {FILTER_TOKENS.video.legacy}
          </label>
        </FilterSection>

        <FilterSection label={FILTER_TOKENS.audio.label} className="text-xs w-fit max-w-full order-4">
          <select
            value={audioFormat}
            onChange={(e) => patch({ audioFormat: e.target.value || null })}
            className="px-2 py-1 rounded text-xs focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            <option value="">{FILTER_TOKENS.audio.formatPlaceholder}</option>
            {AUDIO_FORMAT_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            value={audioLayout}
            onChange={(e) => patch({ audioLayout: e.target.value || null })}
            className="px-2 py-1 rounded text-xs focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            <option value="">{FILTER_TOKENS.audio.channelsPlaceholder}</option>
            {AUDIO_LAYOUT_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </FilterSection>

        <div className="order-4 ml-auto flex items-center">
          {selectedBatch.length > 0 && (
            <button
              type="button"
              onClick={openBatchModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-70"
              style={{ borderColor: 'var(--c-accent)', background: 'var(--c-accent)', color: '#fff' }}
              title="Scout Batch"
            >
              <Search size={12} />
              Scout Batch
            </button>
          )}
        </div>

        {/* Reset to seeded defaults */}
        {hasFilterOverrides && (
          <button
            type="button"
            onClick={() =>
              patch({
                q: null,
                resolution: null,
                codec: null,
                audioFormat: null,
                audioLayout: null,
                hdr: null,
                dv: null,
                av1Compat: null,
                legacy: null,
                noJf: null,
                multi: null,
                minCritic: null,
                minCommunity: null,
                criticScoreMin: null,
                imdbScoreMin: null,
                genre: null,
                genreAnd: null,
                tags: null,
                releaseGroup: null,
              })
            }
            className="text-xs leading-none h-6 px-2 rounded border font-semibold inline-flex items-center self-center order-4"
            style={{ color: '#ddd6fe', borderColor: 'rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.2)' }}
          >
            Reset filters
          </button>
        )}

        <div className="w-full order-7 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5" style={{ color: 'var(--c-muted)' }}>
            <span>Scout is a pre-sorted queue based on minimum qualifiers.</span>
            <Link to="/settings/scout" className="font-semibold underline" style={{ color: '#ddd6fe' }}>
              Adjust thresholds in Settings → Scout
            </Link>
          </div>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--c-muted)' }}>
            {data ? (
              <>
                <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
                  {data.total.toLocaleString()}
                </span>
                <span>candidates</span>
              </>
            ) : (
              '…'
            )}
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
              {selectedBatch.length}/{maxBatch}
            </span>
            <span>selected</span>
          </span>
        </div>

        <div className="w-full order-3" />
        <div className="w-full order-5" />
      </div>
      {(batchUiError || batchResultMsg) && (
        <div className="px-6 py-2 text-xs" style={{ color: batchUiError ? '#f87171' : '#8b87aa' }}>
          {batchUiError || batchResultMsg}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        {isLoading ? (
          <div className="p-8" style={{ color: 'var(--c-muted)' }}>
            Loading…
          </div>
        ) : !data?.candidates.length ? (
          <div className="p-8 space-y-1" style={{ color: 'var(--c-muted)' }}>
            <p className="text-sm">No upgrade candidates with current filters.</p>
            <p className="text-xs">
              Scout Queue requires critic and IMDb ratings — these come from{' '}
              <strong style={{ color: 'var(--c-text)' }}>Jellyfin Sync</strong> (Scan &amp; Sync page). If you haven't
              synced yet, all ratings are null and no movies will appear here. Try setting Critic Score and Min IMDb to
              0 to see all scanned movies regardless of ratings.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr
                className="text-left text-xs uppercase tracking-wider sticky top-0"
                style={{
                  borderBottom: '1px solid var(--c-border)',
                  background: 'var(--c-surface)',
                  color: 'var(--c-muted)',
                }}
              >
                <th className="px-2 py-2 text-center" style={{ width: '32px' }}>
                  <label
                    className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                    style={{ minWidth: 28, minHeight: 28 }}
                  >
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                      aria-label="Select all rows on this page"
                      className="w-5 h-5 accent-violet-600 cursor-pointer"
                    />
                  </label>
                </th>
                <th
                  className="px-3 py-2"
                  title="Priority score = round((CriticRating * 0.4) + (IMDbRating * 6)). Higher means better upgrade candidate."
                >
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
                <th className="px-3 py-2 min-w-[260px]">Quality</th>
                <th className="px-3 py-2">HDR</th>
                <th className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    Group
                    <InfoHint label="Group info" text="Torrent/Usenet release group inferred from the filename only." />
                  </span>
                </th>
                <th className="px-2 py-2 text-center w-20">Flags</th>
                <th
                  className="px-3 py-2 text-right"
                  title="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin. Red = Fresh (≥60), grey = Rotten (<60)."
                >
                  <span className="inline-flex items-center gap-1">
                    Critic Score
                    <InfoHint
                      label="Critic score info"
                      text="Jellyfin critic score (0–100). Value is blank when Jellyfin sync is pending or data unavailable in Jellyfin."
                    />
                  </span>
                </th>
                <th className="px-3 py-2 text-right" title="IMDb community rating (0–10) from Jellyfin CommunityRating">
                  IMDb
                </th>
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
                  <td
                    className="px-2 py-2 text-center"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <label
                      className="inline-flex items-center justify-center cursor-pointer p-1 rounded"
                      style={{ minWidth: 28, minHeight: 28 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatch.includes(c.id)}
                        onChange={(e) => toggleRowSelection(c.id, e.target.checked)}
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
                  <td className="px-3 py-2" style={{ color: 'var(--c-muted)' }}>
                    {c.parsed_year ?? '—'}
                  </td>
                  <td className="px-3 py-2 min-w-[260px]">
                    <span className="inline-flex gap-1 flex-wrap">
                      <ResolutionBadge resolution={c.resolution_cat} />
                      <CodecBadge codec={c.video_codec} showCompatWarning />
                      <AudioQualityBadges audioCodec={c.audio_codec} audioProfile={c.audio_profile} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <HdrBadge hdrFormats={c.hdr_formats} dvProfile={c.dv_profile} />
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--c-muted)' }}>
                    {c.release_group ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
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

      {selectedId && <MovieDetailDrawer movieId={selectedId} onClose={() => setSelectedId(undefined)} />}

      <BatchConfirmModal
        open={showBatchModal}
        selectedRows={selectedRows}
        maxBatch={maxBatch}
        isPending={batchMutation.isPending}
        onClose={() => setShowBatchModal(false)}
        onConfirm={confirmScoutBatch}
      />
    </div>
  );
}
