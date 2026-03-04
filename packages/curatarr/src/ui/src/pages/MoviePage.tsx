import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MovieDetailContent } from '../components/MovieDetailContent.js';

export function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const movieId = parseInt(id ?? '0', 10);

  if (!movieId) {
    return (
      <div className="p-8">
        <div className="text-red-400 mb-4">Movie not found.</div>
        <button onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--c-muted)' }}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-5">
      <div>
        <Link to="/library" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--c-muted)' }}>
          <ArrowLeft size={14} /> Library
        </Link>
      </div>

      <div className="rounded-xl border p-5" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <MovieDetailContent
          movieId={movieId}
          mode="page"
          enableScoutSearch
          onDeleted={() => navigate('/library')}
        />
      </div>
    </div>
  );
}
