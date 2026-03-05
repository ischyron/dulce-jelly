import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { InfoHint } from '../../../components/InfoHint.js';
import type { SortField } from '../types.js';

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
    <th
      className={`px-3 py-2 font-medium text-xs uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--c-muted)' }}
      onClick={() => onChange(field)}
    >
      <span className="inline-flex items-center gap-1">
        {align === 'right' && (active
          ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronsUpDown size={11} className="opacity-30" />)}
        {label}
        {infoTitle && <InfoHint label={`${label} info`} text={infoTitle} />}
        {align !== 'right' && (active
          ? (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ChevronsUpDown size={11} className="opacity-30" />)}
      </span>
    </th>
  );
}
