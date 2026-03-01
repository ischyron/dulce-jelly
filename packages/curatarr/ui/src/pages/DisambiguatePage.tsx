import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, GitMerge, AlertTriangle } from 'lucide-react';
import { api, type DisambiguationLogRow } from '../api/client.js';

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

  const pending = data?.items ?? [];

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
                    <td className="px-4 py-2.5" style={{ color: 'var(--c-muted)' }}>
                      {row.input_year ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs max-w-xs truncate"
                      style={{ color: 'var(--c-muted)' }}>
                      {row.matched_movie_id ? `#${row.matched_movie_id}` : '—'}
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

    </div>
  );
}
