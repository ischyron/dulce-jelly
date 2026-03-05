import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

export function Accordion({
  title,
  defaultOpen = false,
  icon,
  variant = 'default',
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  variant?: 'default' | 'general' | 'scout';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerTone =
    variant === 'general'
      ? { border: 'rgba(56,189,248,0.35)', bg: 'rgba(56,189,248,0.08)', text: '#bae6fd', icon: '#38bdf8' }
      : variant === 'scout'
        ? { border: 'rgba(124,58,237,0.45)', bg: 'rgba(124,58,237,0.12)', text: '#ddd6fe', icon: '#a78bfa' }
        : { border: 'var(--c-border)', bg: 'transparent', text: '#d4cfff', icon: 'var(--c-muted)' };

  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--c-surface)', borderColor: headerTone.border }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 text-left flex items-center justify-between transition-colors hover:bg-white/5"
        style={{ background: headerTone.bg }}
      >
        <span className="font-semibold inline-flex items-center gap-2" style={{ color: headerTone.text }}>
          {icon ? <span style={{ color: headerTone.icon }}>{icon}</span> : null}
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? 'rotate-180' : 'rotate-0'}`}
          style={{ color: 'var(--c-muted)' }}
        />
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  );
}
