import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MovieDetailContent } from '../components/shared/movie-detail';

export function Movie() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scoutPanelActive, setScoutPanelActive] = useState(false);
  const movieId = Number.parseInt(id ?? '0', 10);

  if (!movieId) {
    return (
      <div className="p-8">
        <div className="text-red-400 mb-4">Movie not found.</div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm underline"
          style={{ color: 'var(--c-muted)' }}
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="px-6 py-3 border-b flex items-center shrink-0"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm hover:underline"
          style={{ color: 'var(--c-muted)' }}
        >
          <ArrowLeft size={14} /> Library
        </Link>
      </div>

      <div className={`px-6 py-6 space-y-5 ${scoutPanelActive ? 'max-w-none w-full' : 'max-w-5xl'}`}>
        <div
          className="rounded-xl border p-5"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
          <MovieDetailContent
            movieId={movieId}
            mode="page"
            onDeleted={() => navigate('/library')}
            onScoutPanelStateChange={setScoutPanelActive}
          />
        </div>
      </div>
    </div>
  );
}
