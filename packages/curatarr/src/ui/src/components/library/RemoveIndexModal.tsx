interface Props {
  open: boolean;
  selectedCount: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveIndexModal({ open, selectedCount, pending, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        role="button"
        tabIndex={0}
        aria-label="Close"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-index-title"
        className="relative w-[560px] max-w-[92vw] rounded-xl border p-4 space-y-3"
        style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}
      >
        <div id="remove-index-title" className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          Remove from Curatarr Index
        </div>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
          Remove {selectedCount} selected item(s) from the Curatarr index only? Files on disk will remain untouched.
        </div>
        <div className="text-xs italic" style={{ color: '#d4cfff' }}>
          To delete this movie permanently, open Movie Details and click Delete.
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs border"
            style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="px-3 py-1.5 rounded text-xs border disabled:opacity-40"
            style={{ borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
          >
            {pending ? 'Removing…' : 'Remove from Index'}
          </button>
        </div>
      </div>
    </div>
  );
}
