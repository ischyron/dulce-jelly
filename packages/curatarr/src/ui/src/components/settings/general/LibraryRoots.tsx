import { FolderOpen, Library as LibraryIcon, Minus, Plus } from 'lucide-react';
import type { GeneralPanelProps } from '../types';

export function LibraryRoots({
  movieRoots,
  updateMovieRoot,
  openBrowse,
  removeMovieRoot,
  addMovieRoot,
}: Pick<GeneralPanelProps, 'movieRoots' | 'updateMovieRoot' | 'openBrowse' | 'removeMovieRoot' | 'addMovieRoot'>) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        <LibraryIcon size={16} style={{ color: 'var(--c-accent)' }} />
        Library Root Folders
      </h2>
      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Movies
        </div>
        {movieRoots.map((value, idx) => (
          <div key={`movie-root-${value || 'empty'}-${idx}`} className="flex items-center gap-2">
            <input
              value={value}
              onChange={(e) => updateMovieRoot(idx, e.target.value)}
              placeholder="/media/Movies"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <button
              type="button"
              onClick={() => openBrowse(idx)}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
              title="Browse folders"
            >
              <FolderOpen size={14} />
              Browse
            </button>
            <button
              type="button"
              onClick={() => removeMovieRoot(idx)}
              className="px-2 py-2 rounded-lg"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              title="Remove folder"
            >
              <Minus size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addMovieRoot}
          className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
        >
          <Plus size={14} />
          Add folder
        </button>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Used by Scan when path override is blank. Configurable via <code>config/config.yaml</code> (
          <code>settings.libraryRoots</code>).
        </p>
      </div>

      <div
        className="rounded-lg border p-3 space-y-2 opacity-80"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
          Series
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Coming soon
        </p>
      </div>
    </section>
  );
}
