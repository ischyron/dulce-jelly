import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from 'react';
import { forwardRef } from 'react';

type FilterLabelTone = 'blue' | 'pink';

interface FilterSectionProps extends ComponentPropsWithoutRef<'div'> {
  label: string;
  labelTone?: FilterLabelTone;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

function labelStyles(tone: FilterLabelTone): CSSProperties {
  if (tone === 'pink') {
    return {
      color: '#f9a8d4',
      borderColor: 'rgba(249,168,212,0.35)',
      background: 'rgba(249,168,212,0.12)',
    };
  }
  return {
    color: '#93c5fd',
    borderColor: 'rgba(147,197,253,0.35)',
    background: 'rgba(147,197,253,0.12)',
  };
}

export const FilterSection = forwardRef<HTMLDivElement, FilterSectionProps>(function FilterSection(
  { label, labelTone = 'blue', className = '', style, children },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`flex flex-wrap items-center gap-2 px-2 py-1 rounded-lg border ${className}`.trim()}
      style={{ borderColor: 'var(--c-border)', background: 'rgba(255,255,255,0.01)', ...style }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap px-1.5 py-0.5 rounded border"
        style={labelStyles(labelTone)}
      >
        {label}
      </span>
      {children}
    </div>
  );
});
