import { useEffect } from 'react';
import { X, Film, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MovieDetailContent } from './MovieDetailContent.js';

interface Props {
  movieId: number;
  onClose: () => void;
  enableScoutSearch?: boolean;
}

export function MovieDetailDrawer({ movieId, onClose, enableScoutSearch = false }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside className="relative z-10 w-[700px] max-w-full border-l flex flex-col overflow-hidden"
        style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            <Film size={16} style={{ color: 'var(--c-accent)' }} />
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
            <button onClick={onClose} style={{ color: 'var(--c-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <MovieDetailContent
            movieId={movieId}
            mode="drawer"
            enableScoutSearch={enableScoutSearch}
            onClose={onClose}
            onDeleted={onClose}
          />
        </div>
      </aside>
    </div>
  );
}
