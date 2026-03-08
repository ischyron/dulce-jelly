import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, children }: PageHeaderProps) {
  return (
    <div
      className="px-6 py-3 border-b flex items-center gap-2 shrink-0"
      style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
    >
      <Icon size={17} style={{ color: 'var(--c-accent)' }} />
      <h1 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
        {title}
      </h1>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}
