import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { InfoHint } from '../InfoHint';
import type { SortField } from './types';

interface Props {
  field: SortField;
  label: string;
  current: SortField;
  dir: 'asc' | 'desc';
  onChange: (field: SortField) => void;
  align?: 'left' | 'right';
  infoTitle?: string;
}

export function SortHeader({ field, label, current, dir, onChange, align = 'left', infoTitle }: Props) {
  const active = current === field;

  return (
    <th className={align === 'right' ? 'text-right' : 'text-left'}>
      <button
        type="button"
        className={`w-full px-3 py-2 font-medium text-xs uppercase tracking-wider cursor-pointer select-none whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--c-accent)] rounded ${align === 'right' ? 'text-right' : 'text-left'}`}
        style={{ color: 'var(--c-muted)', background: 'transparent', border: 'none' }}
        onClick={() => onChange(field)}
      >
        <span className="inline-flex items-center gap-1">
          {align === 'right' &&
            (active ? (
              dir === 'asc' ? (
                <ChevronUp size={11} />
              ) : (
                <ChevronDown size={11} />
              )
            ) : (
              <ChevronsUpDown size={11} className="opacity-30" />
            ))}
          {label}
          {infoTitle && <InfoHint label={`${label} info`} text={infoTitle} />}
          {align !== 'right' &&
            (active ? (
              dir === 'asc' ? (
                <ChevronUp size={11} />
              ) : (
                <ChevronDown size={11} />
              )
            ) : (
              <ChevronsUpDown size={11} className="opacity-30" />
            ))}
        </span>
      </button>
    </th>
  );
}
