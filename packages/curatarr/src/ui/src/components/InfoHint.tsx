import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './shared/overlays/Popover';

interface Props {
  text?: string;
  content?: ReactNode;
  label: string;
}

export function InfoHint({ text, content, label }: Props) {
  const body = content ?? text ?? '';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full cursor-pointer transition-colors"
          style={{
            color: '#8b87aa',
            width: 16,
            height: 16,
            border: '1px solid rgba(139,135,170,0.35)',
            background: 'rgba(139,135,170,0.08)',
          }}
          aria-label={label}
          title={label}
          onClick={(e) => {
            // Keep tooltip clickable even when rendered inside parent links/cards.
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--c-accent)';
            e.currentTarget.style.color = '#c4b5fd';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139,135,170,0.35)';
            e.currentTarget.style.color = '#8b87aa';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(196,181,253,0.55)';
            e.currentTarget.style.color = '#c4b5fd';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(139,135,170,0.35)';
            e.currentTarget.style.color = '#8b87aa';
          }}
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72"
        style={{
          background: '#111827',
          borderColor: '#374151',
          color: '#d1d5db',
          lineHeight: '1.45',
        }}
      >
        <div className="whitespace-pre-line">{body}</div>
      </PopoverContent>
    </Popover>
  );
}
