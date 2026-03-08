import { Library as LibraryIcon, Search } from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { FilterSection } from '../shared/FilterSection';
import { FILTER_TOKENS } from '../shared/filterTokens';
import { getCodecDescription } from '../shared/utils';
import { formatTotalSize } from './helpers';
import {
  AUDIO_FORMAT_OPTIONS,
  AUDIO_LAYOUT_OPTIONS,
  CODEC_OPTIONS,
  PAGE_SIZE_OPTIONS,
  RESOLUTION_OPTIONS,
} from './types';

function isSurfaceToggleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return (
    target.closest('button, input, select, textarea, a, label, [role="button"], [role="link"], [role="checkbox"]') ===
    null
  );
}

interface Props {
  isFetching: boolean;
  searchInput: string;
  onSearchInput: (value: string) => void;

  genreFilterRef: RefObject<HTMLDivElement>;
  genreFilterOpen: boolean;
  setGenreFilterOpen: Dispatch<SetStateAction<boolean>>;
  genres: string[];
  selectedGenres: string[];
  genreAnd: boolean;
  onToggleGenreFilter: (genre: string) => void;
  onToggleGenreAnd: (checked: boolean) => void;
  onRemoveGenreFilter: (genre: string) => void;

  resolution: string;
  onToggleResolution: (resolution: string) => void;

  codec: string;
  onToggleCodec: (codec: string) => void;
  hdrOnly: boolean;
  onToggleHdrOnly: (checked: boolean) => void;
  dvOnly: boolean;
  onToggleDvOnly: (checked: boolean) => void;
  av1CompatOnly: boolean;
  onToggleAv1CompatOnly: (checked: boolean) => void;
  legacyOnly: boolean;
  onToggleLegacyOnly: (checked: boolean) => void;

  audioFormat: string;
  onAudioFormatChange: (value: string) => void;
  audioLayout: string;
  onAudioLayoutChange: (value: string) => void;

  tagFilterRef: RefObject<HTMLDivElement>;
  tagFilterOpen: boolean;
  setTagFilterOpen: Dispatch<SetStateAction<boolean>>;
  tags: string[];
  selectedTags: string[];
  onToggleFilterTag: (tag: string) => void;
  onRemoveFilterTag: (tag: string) => void;

  multiOnly: boolean;
  onToggleMultiOnly: (checked: boolean) => void;
  noJf: boolean;
  onToggleNoJf: (checked: boolean) => void;

  showAll: boolean;
  limit: number;
  onPageSizeChange: (value: string) => void;

  hasNonDefaultView: boolean;
  onResetView: () => void;

  av1CompatRelevant: boolean;
  clientProfile: string;

  selectedCount: number;
  onOpenAddTagsModal: () => void;
  onOpenRemoveTagsModal: () => void;
  onRemoveSelectedFromIndex: () => void;
  removePending: boolean;

  totalMovies?: number;
  totalLibrarySize?: number;
}

export function LibraryFilterBar({
  isFetching,
  searchInput,
  onSearchInput,
  genreFilterRef,
  genreFilterOpen,
  setGenreFilterOpen,
  genres,
  selectedGenres,
  genreAnd,
  onToggleGenreFilter,
  onToggleGenreAnd,
  onRemoveGenreFilter,
  resolution,
  onToggleResolution,
  codec,
  onToggleCodec,
  hdrOnly,
  onToggleHdrOnly,
  dvOnly,
  onToggleDvOnly,
  av1CompatOnly,
  onToggleAv1CompatOnly,
  legacyOnly,
  onToggleLegacyOnly,
  audioFormat,
  onAudioFormatChange,
  audioLayout,
  onAudioLayoutChange,
  tagFilterRef,
  tagFilterOpen,
  setTagFilterOpen,
  tags,
  selectedTags,
  onToggleFilterTag,
  onRemoveFilterTag,
  multiOnly,
  onToggleMultiOnly,
  noJf,
  onToggleNoJf,
  showAll,
  limit,
  onPageSizeChange,
  hasNonDefaultView,
  onResetView,
  av1CompatRelevant,
  clientProfile,
  selectedCount,
  onOpenAddTagsModal,
  onOpenRemoveTagsModal,
  onRemoveSelectedFromIndex,
  removePending,
  totalMovies,
  totalLibrarySize,
}: Props) {
  return (
    <div
      className="sticky top-0 z-10 px-6 py-3 border-b flex flex-wrap items-center gap-x-2 gap-y-1.5 lg:gap-x-3"
      style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
    >
      {isFetching && (
        <div className="absolute left-0 right-0 top-0 h-[2px] overflow-hidden">
          <div className="h-full bg-violet-500/80 animate-pulse" />
        </div>
      )}

      <h1
        className="text-base font-semibold shrink-0 flex items-center gap-2 h-8 w-full sm:w-auto order-1 self-center"
        style={{ color: 'var(--c-text)' }}
      >
        <LibraryIcon size={17} style={{ color: 'var(--c-accent)' }} />
        Library
      </h1>

      <div className="relative w-full sm:w-auto order-1">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-muted)' }} />
        <input
          type="text"
          aria-label="Search titles"
          placeholder="Search titles…"
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
          className="pl-8 pr-3 py-1.5 rounded-lg text-sm focus:outline-none w-full sm:w-56 lg:w-64"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--c-accent)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--c-border)';
          }}
        />
      </div>

      <FilterSection
        ref={genreFilterRef}
        label={FILTER_TOKENS.genre.label}
        className="relative text-xs w-full xl:w-auto order-2"
        style={{ color: 'var(--c-muted)' }}
        onClick={(e) => {
          if (isSurfaceToggleTarget(e.target)) setGenreFilterOpen((v) => !v);
        }}
      >
        <button
          type="button"
          onClick={() => setGenreFilterOpen((v) => !v)}
          aria-expanded={genreFilterOpen}
          aria-haspopup="listbox"
          className="px-2 py-1 text-xs rounded border"
          style={{ borderColor: 'var(--c-border)', color: selectedGenres.length ? '#c4b5fd' : 'var(--c-muted)' }}
        >
          {selectedGenres.length > 0 ? `${selectedGenres.length} selected` : FILTER_TOKENS.genre.select}
        </button>
        {selectedGenres.length > 1 && (
          <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide cursor-pointer">
            <input
              type="checkbox"
              checked={genreAnd}
              onChange={(e) => onToggleGenreAnd(e.target.checked)}
              className="accent-violet-600"
            />
            AND
          </label>
        )}
        {genreFilterOpen && (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
          >
            {genres.length === 0 && (
              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                {FILTER_TOKENS.genre.noOptions}
              </div>
            )}
            {genres.map((genre) => (
              <label
                key={genre}
                className="flex items-center gap-2 text-xs cursor-pointer"
                style={{ color: selectedGenres.includes(genre) ? '#d4cfff' : 'var(--c-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={selectedGenres.includes(genre)}
                  onChange={() => onToggleGenreFilter(genre)}
                  className="accent-violet-600"
                />
                <span>{genre}</span>
              </label>
            ))}
          </div>
        )}
        {selectedGenres.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {selectedGenres.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => onRemoveGenreFilter(genre)}
                aria-label={`Remove ${genre} filter`}
                className="px-2 py-0.5 rounded-full text-xs border"
                style={{ color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }}
              >
                {genre} ×
              </button>
            ))}
          </div>
        )}
      </FilterSection>

      <FilterSection label="Resolution" className="w-full xl:w-auto order-2">
        {RESOLUTION_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onToggleResolution(item)}
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

      <FilterSection label={FILTER_TOKENS.video.label} className="w-fit max-w-full order-4">
        {CODEC_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onToggleCodec(item)}
            className="px-2 py-1 text-xs rounded border transition-colors"
            style={
              codec === item
                ? { background: 'var(--c-accent)', borderColor: 'var(--c-accent)', color: 'white' }
                : { borderColor: 'var(--c-border)', color: 'var(--c-muted)' }
            }
            title={getCodecDescription(item) ?? item}
          >
            {item.toUpperCase()}
          </button>
        ))}
        <span style={{ color: 'var(--c-border)' }}>·</span>

        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--c-muted)' }}
          title={getCodecDescription('hdr')}
        >
          <input
            type="checkbox"
            checked={hdrOnly}
            onChange={(e) => onToggleHdrOnly(e.target.checked)}
            className="accent-violet-600"
          />
          HDR
        </label>

        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: 'var(--c-muted)' }}
          title={getCodecDescription('dv')}
        >
          <input
            type="checkbox"
            checked={dvOnly}
            onChange={(e) => onToggleDvOnly(e.target.checked)}
            className="accent-violet-600"
          />
          {FILTER_TOKENS.video.dv}
        </label>

        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: av1CompatOnly ? '#fbbf24' : 'var(--c-muted)' }}
          title={getCodecDescription('av1') ?? 'Show AV1 files that may require transcoding on current client profile'}
        >
          <input
            type="checkbox"
            checked={av1CompatOnly}
            onChange={(e) => onToggleAv1CompatOnly(e.target.checked)}
            className="accent-violet-600"
          />
          {FILTER_TOKENS.video.av1Compat}
        </label>

        <label
          className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          style={{ color: legacyOnly ? '#fb923c' : 'var(--c-muted)' }}
          title={getCodecDescription('legacy')}
        >
          <input
            type="checkbox"
            checked={legacyOnly}
            onChange={(e) => onToggleLegacyOnly(e.target.checked)}
            className="accent-violet-600"
          />
          {FILTER_TOKENS.video.legacy}
        </label>
      </FilterSection>

      <FilterSection
        label={FILTER_TOKENS.audio.label}
        className="w-fit max-w-full order-4"
        style={{ color: 'var(--c-muted)' }}
      >
        <select
          value={audioFormat}
          onChange={(e) => onAudioFormatChange(e.target.value)}
          aria-label="Audio format filter"
          className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
          style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            color: audioFormat ? 'var(--c-accent)' : 'var(--c-muted)',
          }}
          title={
            audioFormat
              ? (getCodecDescription(audioFormat) ?? 'Primary audio format filter')
              : 'Primary audio format filter'
          }
        >
          <option value="">{FILTER_TOKENS.audio.formatPlaceholder}</option>
          {AUDIO_FORMAT_OPTIONS.map((format) => (
            <option key={format} value={format}>
              {format.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          value={audioLayout}
          onChange={(e) => onAudioLayoutChange(e.target.value)}
          aria-label="Audio channel layout filter"
          className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
          style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            color: audioLayout ? 'var(--c-accent)' : 'var(--c-muted)',
          }}
          title={
            audioLayout
              ? (getCodecDescription(audioLayout) ?? 'Primary audio channel layout filter')
              : 'Primary audio channel layout filter'
          }
        >
          <option value="">{FILTER_TOKENS.audio.channelsPlaceholder}</option>
          {AUDIO_LAYOUT_OPTIONS.map((layout) => (
            <option key={layout} value={layout}>
              {layout}
            </option>
          ))}
        </select>
      </FilterSection>

      {hasNonDefaultView && (
        <button
          type="button"
          onClick={onResetView}
          className="text-xs leading-none h-6 px-2 rounded border font-semibold inline-flex items-center self-center order-4"
          style={{ color: '#ddd6fe', borderColor: 'rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.2)' }}
          title="Reset active filters and keep the current page-size preference"
        >
          reset filters
        </button>
      )}

      <FilterSection
        ref={tagFilterRef}
        label={FILTER_TOKENS.tags.label}
        labelTone="pink"
        className="relative text-xs w-full xl:w-auto order-2"
        style={{ color: 'var(--c-muted)' }}
        onClick={(e) => {
          if (isSurfaceToggleTarget(e.target)) setTagFilterOpen((v) => !v);
        }}
      >
        <button
          type="button"
          onClick={() => setTagFilterOpen((v) => !v)}
          aria-expanded={tagFilterOpen}
          aria-haspopup="listbox"
          className="px-2 py-1 text-xs rounded border"
          style={{ borderColor: 'var(--c-border)', color: selectedTags.length ? '#c4b5fd' : 'var(--c-muted)' }}
        >
          {selectedTags.length > 0 ? `${selectedTags.length} selected` : FILTER_TOKENS.tags.select}
        </button>
        {tagFilterOpen && (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 max-h-60 overflow-auto rounded-lg border p-2 space-y-1"
            style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
          >
            {tags.length === 0 && (
              <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
                {FILTER_TOKENS.tags.noOptions}
              </div>
            )}
            {tags.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-2 text-xs cursor-pointer"
                style={{ color: selectedTags.includes(tag) ? '#d4cfff' : 'var(--c-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => onToggleFilterTag(tag)}
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
                onClick={() => onRemoveFilterTag(tag)}
                aria-label={`Remove ${tag} filter`}
                className="px-2 py-0.5 rounded-full text-xs border"
                style={{ color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }}
              >
                {tag} ×
              </button>
            ))}
          </div>
        )}
      </FilterSection>

      <FilterSection label="Flags" className="w-full xl:w-auto order-2" style={{ color: 'var(--c-muted)' }}>
        <label
          className="flex items-center gap-1.5 text-xs leading-none h-6 cursor-pointer select-none"
          style={{ color: multiOnly ? '#c4b5fd' : 'var(--c-muted)' }}
          title="Show movies that have multiple video files in the same movie folder"
        >
          <input
            type="checkbox"
            checked={multiOnly}
            onChange={(e) => onToggleMultiOnly(e.target.checked)}
            className="accent-violet-600"
          />
          Has multi-part/versions
        </label>
        <label
          className="flex items-center gap-1.5 text-xs leading-none h-6 cursor-pointer select-none"
          style={{ color: noJf ? '#c4b5fd' : 'var(--c-muted)' }}
          title="Show movies not yet matched in Jellyfin"
        >
          <input
            type="checkbox"
            checked={noJf}
            onChange={(e) => onToggleNoJf(e.target.checked)}
            className="accent-violet-600"
          />
          Jellyfin Sync Needed
        </label>
      </FilterSection>

      <div
        className="flex items-center gap-1.5 text-xs leading-none h-6 order-4 lg:ml-auto self-center"
        style={{ color: 'var(--c-muted)' }}
      >
        <span>Show</span>
        <select
          value={showAll ? 'all' : String(limit)}
          onChange={(e) => onPageSizeChange(e.target.value)}
          aria-label="Rows per page"
          className="px-1.5 py-0.5 rounded text-xs focus:outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All' : option}
            </option>
          ))}
        </select>
      </div>

      <span
        className="text-xs flex flex-wrap items-center gap-2 leading-none h-6 order-4 self-center"
        style={{ color: 'var(--c-muted)' }}
      >
        {av1CompatOnly && av1CompatRelevant && (
          <>
            <span
              className="text-amber-400"
              title={`Profile ${clientProfile.replace('_', ' ')} may not hardware-decode AV1`}
            >
              ⚠ transcode-prone
            </span>
            <span style={{ color: 'var(--c-border)' }}>·</span>
          </>
        )}

        {selectedCount > 0 && (
          <>
            <button
              type="button"
              onClick={onOpenAddTagsModal}
              className="px-2 py-1 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#a7f3d0', background: 'rgba(16,185,129,0.12)' }}
              title="Batch-add tags to selected rows"
            >
              Tags + ({selectedCount})
            </button>
            <button
              type="button"
              onClick={onOpenRemoveTagsModal}
              className="px-2 py-1 rounded border text-xs"
              style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(239,68,68,0.1)' }}
              title="Batch-remove tags from selected rows"
            >
              Tags -
            </button>
            <button
              type="button"
              onClick={onRemoveSelectedFromIndex}
              disabled={removePending}
              className="px-2 py-1 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
              title="Remove selected rows from Curatarr DB only (files untouched)"
            >
              {removePending ? 'Removing…' : `Remove ${selectedCount}`}
            </button>
            <span style={{ color: 'var(--c-border)' }}>·</span>
          </>
        )}

        {isFetching && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--c-accent)' }}
          />
        )}

        {typeof totalMovies === 'number' ? (
          <>
            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
              {totalMovies.toLocaleString()}
            </span>
            <span>movies</span>
          </>
        ) : (
          '—'
        )}

        {typeof totalLibrarySize === 'number' && totalLibrarySize > 0 ? (
          <>
            <span style={{ color: 'var(--c-border)' }}>·</span>
            <span title="Total size on disk for current filtered results">
              Total Size: {formatTotalSize(totalLibrarySize)}
            </span>
          </>
        ) : null}
      </span>

      <div className="w-full order-3" />
      <div className="w-full order-5" />
    </div>
  );
}
