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
          className="inline-flex items-center justify-center rounded-full cursor-pointer"
          style={{ color: '#8b87aa' }}
          aria-label={label}
          title={label}
          onClick={(e) => {
            // Keep tooltip clickable even when rendered inside parent links/cards.
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
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
