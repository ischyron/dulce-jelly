import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  onChangePage: (page: number) => void;
}

export function LibraryPagination({ page, totalPages, limit, total, onChangePage }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div
      className="px-4 py-2.5 border-t flex items-center justify-center text-sm"
      style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
    >
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => onChangePage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm disabled:opacity-40"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
        >
          <ChevronLeft size={13} /> Previous
        </button>

        <div className="flex items-center gap-2" style={{ color: 'var(--c-muted)' }}>
          <span>Page {page} of {totalPages}</span>
          <span style={{ color: 'var(--c-border)' }}>·</span>
          <span style={{ fontSize: '0.7rem' }}>
            {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
          </span>
        </div>

        <button
          onClick={() => onChangePage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm disabled:opacity-40"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
        >
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}
