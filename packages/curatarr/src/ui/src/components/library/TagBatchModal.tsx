interface Props {
  mode: 'add' | 'remove';
  selectedCount: number;
  allTags: string[];
  pending: boolean;
  open: boolean;
  tagPick: string;
  tagInput: string;
  batchTags: string[];
  onClose: () => void;
  onTagPickChange: (value: string) => void;
  onTagInputChange: (value: string) => void;
  onAddPicked: () => void;
  onAddInput: () => void;
  onRemoveBatchTag: (tag: string) => void;
  onApply: () => void;
}

export function TagBatchModal({
  mode,
  selectedCount,
  allTags,
  pending,
  open,
  tagPick,
  tagInput,
  batchTags,
  onClose,
  onTagPickChange,
  onTagInputChange,
  onAddPicked,
  onAddInput,
  onRemoveBatchTag,
  onApply,
}: Props) {
  if (!open) return null;

  const isAddMode = mode === 'add';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-[560px] max-w-[92vw] rounded-xl border p-4 space-y-3"
        style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          {isAddMode ? 'Add Tags to' : 'Remove Tags from'} {selectedCount} Selected Movies
        </div>

        {!isAddMode && (
          <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Select existing tags and keep adding them to the remove list.
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={tagPick}
            onChange={(e) => onTagPickChange(e.target.value)}
            className="px-2 py-1 rounded text-xs focus:outline-none min-w-[11rem]"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            <option value="">Select existing tag</option>
            {allTags
              .filter((tag) => !batchTags.includes(tag))
              .map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
          </select>

          <button
            onClick={onAddPicked}
            disabled={!tagPick}
            className="px-2 py-1 text-xs rounded border disabled:opacity-40"
            style={{ borderColor: 'var(--c-border)', color: isAddMode ? '#c4b5fd' : '#fca5a5' }}
          >
            {isAddMode ? 'Add' : 'Add to remove list'}
          </button>

          {isAddMode && (
            <>
              <input
                value={tagInput}
                onChange={(e) => onTagInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddInput();
                }}
                placeholder="new tag"
                className="px-2 py-1 rounded text-xs focus:outline-none"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
              <button
                onClick={onAddInput}
                disabled={!tagInput.trim()}
                className="px-2 py-1 text-xs rounded border disabled:opacity-40"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                Add new
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 min-h-6">
          {batchTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onRemoveBatchTag(tag)}
              className="px-2 py-0.5 rounded-full text-xs border"
              style={
                isAddMode
                  ? { color: '#c4b5fd', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.12)' }
                  : { color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }
              }
            >
              {tag} ×
            </button>
          ))}
          {batchTags.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {isAddMode ? 'No tags selected.' : 'No tags selected for removal.'}
            </span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs border"
            style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={batchTags.length === 0 || pending}
            className="px-3 py-1.5 rounded text-xs border disabled:opacity-40"
            style={
              isAddMode
                ? { borderColor: 'rgba(16,185,129,0.45)', color: '#a7f3d0', background: 'rgba(16,185,129,0.12)' }
                : { borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }
            }
          >
            {pending ? 'Applying…' : isAddMode ? 'Apply Tags' : 'Remove Tags'}
          </button>
        </div>
      </div>
    </div>
  );
}
