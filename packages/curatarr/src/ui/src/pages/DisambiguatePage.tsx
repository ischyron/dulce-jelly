import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, GitMerge, AlertTriangle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type DisambiguationLogRow, type UnmatchedMovie } from '../api/client.js';

const REASON_LABELS: Record<string, string> = {
  year_mismatch: 'Year mismatch',
  title_fuzzy: 'Fuzzy title',
  year_and_title_fuzzy: 'Fuzzy title + year',
};

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? '#4ade80' : pct >= 75 ? '#fbbf24' : '#f87171';
  return (
    <span className="text-xs font-mono px-1.5 py-0.5 rounded"
      style={{ background: 'var(--c-border)', color }}>
      {pct}%
    </span>
  );
}

export function DisambiguatePage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['disambiguate-pending'],
    queryFn: api.disambiguatePending,
    refetchInterval: 10_000,
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'confirm' | 'reject' }) =>
      api.disambiguateReview(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disambiguate-pending'] });
      queryClient.invalidateQueries({ queryKey: ['disambiguate-pending-count'] });
    },
  });
  const retryMut = useMutation({
    mutationFn: (movieId: number) => api.jfRefreshMovie(movieId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disambiguate-pending'] });
      queryClient.invalidateQueries({ queryKey: ['disambiguate-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const pending = data?.items ?? [];
  const unmatched = data?.unmatchedMovies ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <GitMerge size={20} style={{ color: 'var(--c-accent)' }} />
        <h1 className="text-xl font-bold">Disambiguate</h1>
        {(data?.pending ?? 0) > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--c-accent)', color: 'white' }}>
            {data?.pending} pending
          </span>
        )}
      </div>

      {/* Pending review table */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold text-sm">Pending Review</h2>
          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
            {isLoading ? 'Loading…' : `${pending.length} items`}
          </span>
        </div>

        {pending.length === 0 && !isLoading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
            No ambiguous matches pending review.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b text-left"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                  <th className="px-4 py-2">Input Title</th>
                  <th className="px-4 py-2">Year</th>
                  <th className="px-4 py-2">Matched Folder</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Confidence</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(pending as DisambiguationLogRow[]).map((row) => (
                  <tr key={row.id} className="border-b transition-colors"
                    style={{ borderColor: 'var(--c-border)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--c-text)' }}>
                      {row.input_title}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <span className="px-1 rounded"
                        style={{
                          background: row.reason === 'year_mismatch' ? 'rgba(251,191,36,0.2)' : 'transparent',
                          color: row.reason === 'year_mismatch' ? '#fbbf24' : 'var(--c-muted)',
                        }}>
                        {row.input_year ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-xs" style={{ color: 'var(--c-muted)' }}>
                      {row.db_folder_name ? (
                        <span title={row.db_folder_path ?? ''}>
                          <span style={{ color: 'var(--c-text)' }}>{row.db_folder_name}</span>
                          {row.db_parsed_year != null && (
                            <span className="ml-1.5 font-mono px-1 rounded text-xs"
                              style={{
                                background: row.reason === 'year_mismatch' ? 'rgba(251,191,36,0.2)' : 'var(--c-border)',
                                color: row.reason === 'year_mismatch' ? '#fbbf24' : 'var(--c-muted)',
                              }}
                              title={row.reason === 'year_mismatch' ? `DB year ${row.db_parsed_year} ≠ JF year ${row.input_year}` : undefined}>
                              {row.db_parsed_year}
                            </span>
                          )}
                        </span>
                      ) : (row.matched_movie_id ? `#${row.matched_movie_id}` : '—')}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.reason ? (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                          <AlertTriangle size={10} className="inline mr-1" />
                          {REASON_LABELS[row.reason] ?? row.reason}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ConfidenceBadge value={row.confidence} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => reviewMut.mutate({ id: row.id, decision: 'confirm' })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                          style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}
                          disabled={reviewMut.isPending}
                        >
                          <Check size={12} /> Confirm
                        </button>
                        <button
                          onClick={() => reviewMut.mutate({ id: row.id, decision: 'reject' })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors"
                          style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}
                          disabled={reviewMut.isPending}
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unmatched movie folders */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold text-sm">Unmatched Movie Folders</h2>
          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
            {unmatched.length} items
          </span>
        </div>
        {unmatched.length === 0 && !isLoading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--c-muted)' }}>
            No unmatched folders.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b text-left"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                  <th className="px-4 py-2">Folder</th>
                  <th className="px-4 py-2">Parsed</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(unmatched as UnmatchedMovie[]).map((m) => (
                  <tr key={m.id} className="border-b" style={{ borderColor: 'var(--c-border)' }}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--c-text)' }}>{m.folder_name}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                      {(m.parsed_title ?? '—')}{m.parsed_year ? ` (${m.parsed_year})` : ''}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => retryMut.mutate(m.id)}
                          disabled={retryMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border"
                          style={{ borderColor: 'rgba(125,211,252,0.4)', color: '#7dd3fc', background: 'rgba(56,189,248,0.12)' }}
                        >
                          <RefreshCw size={12} className={retryMut.isPending ? 'animate-spin' : ''} />
                          Retry Jellyfin Match
                        </button>
                        <Link
                          to={`/movies/${m.id}`}
                          className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border"
                          style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
                        >
                          Open
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
