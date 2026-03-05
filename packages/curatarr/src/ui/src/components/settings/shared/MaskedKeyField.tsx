import { Eye, EyeOff, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import type { MaskedKeyFieldProps } from '../types';

export function MaskedKeyField({ label, name, maskedValue, value, onChange, hint = '' }: MaskedKeyFieldProps) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasKey = Boolean(maskedValue);

  function handleCancel() {
    onChange('');
    setEditing(false);
    setRevealed(false);
  }

  const inputStyle = {
    background: 'var(--c-bg)',
    border: '1px solid var(--c-border)',
    color: 'var(--c-text)',
  };

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>
        {label}
      </label>

      {hasKey && !editing ? (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono"
            style={{ ...inputStyle, color: 'var(--c-muted)' }}
          >
            <span className="tracking-widest select-none">
              {revealed ? maskedValue : maskedValue.replace(/\*/g, '●')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="p-2 rounded-lg hover:opacity-80"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
            title={revealed ? 'Hide' : 'Show masked key'}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setRevealed(false);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            <Pencil size={12} /> Replace
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              id={name}
              type={revealed ? 'text' : 'password'}
              name={name}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={hasKey ? 'Type new key to replace…' : 'Paste API key…'}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none pr-9"
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--c-accent)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--c-border)';
              }}
            />
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              style={{ color: 'var(--c-muted)' }}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {hasKey && (
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-lg hover:opacity-80"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              title="Cancel — keep existing key"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
