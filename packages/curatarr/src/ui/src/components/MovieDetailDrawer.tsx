import { useEffect, useRef } from 'react';
import { X, Film, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MovieDetailContent } from './MovieDetailContent.js';

interface Props {
  movieId: number;
  onClose: () => void;
  enableScoutSearch?: boolean;
}

export function MovieDetailDrawer({ movieId, onClose, enableScoutSearch = false }: Props) {
  const asideRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus();

    function handleTabTrap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const root = asideRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    window.addEventListener('keydown', handleTabTrap);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keydown', handleTabTrap);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-detail-drawer-title"
        className="relative z-10 w-[700px] max-w-full border-l flex flex-col overflow-hidden"
        style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
          <div id="movie-detail-drawer-title" className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
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
            <button
              ref={closeBtnRef}
              aria-label="Close movie detail drawer"
              data-testid="movie-drawer-close"
              onClick={onClose}
              style={{ color: 'var(--c-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <MovieDetailContent
            movieId={movieId}
            mode="drawer"
            enableScoutSearch={enableScoutSearch}
            onDeleted={onClose}
          />
        </div>
      </aside>
    </div>
  );
}
