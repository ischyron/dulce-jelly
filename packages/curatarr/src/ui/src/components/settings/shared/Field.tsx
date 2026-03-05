import { InfoHint } from '../../InfoHint';
import type { FieldProps } from '../types';

export function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  disabled = false,
  hint = '',
  tooltip = '',
}: FieldProps) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium mb-1 flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
        <span className="whitespace-nowrap">{label}</span>
        {tooltip && <InfoHint label={`${label} info`} text={tooltip} />}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none disabled:opacity-50"
        style={{
          background: 'var(--c-bg)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--c-accent)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'var(--c-border)';
        }}
      />
      {hint && (
        <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
