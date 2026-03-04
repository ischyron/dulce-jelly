import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface Props {
  text: string;
  label: string;
}

export function InfoHint({ text, label }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, []);

  return (
    <span ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="inline-flex items-center justify-center rounded-full cursor-pointer"
        style={{ color: '#8b87aa' }}
        aria-label={label}
        title={label}
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-64 rounded-md border p-2 text-[11px] normal-case tracking-normal"
          style={{
            top: '100%',
            left: '0',
            background: '#111827',
            borderColor: '#374151',
            color: '#d1d5db',
            lineHeight: '1.4',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </div>
      )}
    </span>
  );
}
