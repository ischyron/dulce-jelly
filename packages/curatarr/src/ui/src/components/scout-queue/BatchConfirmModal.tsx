import { X } from 'lucide-react';
import type { Candidate } from '../../api/client';

interface Props {
  open: boolean;
  selectedRows: Candidate[];
  maxBatch: number;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function fileNameFromPath(filePath: string | null): string {
  if (!filePath) return '—';
  const parts = filePath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}

export function BatchConfirmModal({ open, selectedRows, maxBatch, isPending, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-3xl rounded-xl border p-4"
        style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Scout Batch Confirmation
          </h2>
          <button type="button" onClick={onClose} style={{ color: 'var(--c-muted)' }}>
            <X size={16} />
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: 'var(--c-muted)' }}>
          Confirm scouting these titles. Based on current settings and downstream rules, selected titles may be
          recycled/replaced after approval flow.
        </p>

        <div className="max-h-80 overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Current Filename</th>
                <th className="px-3 py-2 text-left">Current Path</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid rgba(38,38,58,0.7)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                    {row.jellyfin_title ?? row.parsed_title ?? row.folder_name}
                  </td>
                  <td className="px-3 py-2 font-mono" style={{ color: '#d4cfff' }}>
                    {fileNameFromPath(row.file_file_path)}
                  </td>
                  <td className="px-3 py-2 font-mono break-all" style={{ color: 'var(--c-muted)' }}>
                    {row.file_file_path}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Showing {selectedRows.length} / {maxBatch} selected (hard max 10).
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-60"
              style={{ background: 'var(--c-accent)' }}
            >
              {isPending ? 'Running…' : 'Confirm Scout Batch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
