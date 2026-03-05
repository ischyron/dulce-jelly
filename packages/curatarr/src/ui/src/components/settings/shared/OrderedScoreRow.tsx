import { useEffect, useState } from 'react';
import type { OrderedScoreRowProps } from '../types';
import { rankByScore } from '../utils/scoring';

export function OrderedScoreRow({ fields, form, onChange }: OrderedScoreRowProps) {
  const [order, setOrder] = useState<string[]>(fields.map((f) => f.key));

  useEffect(() => {
    setOrder(fields.map((f) => f.key));
  }, [fields]);

  function commitReorder() {
    setOrder((prev) => rankByScore(prev, fields, form));
  }

  const fieldMap = new Map(fields.map((f) => [f.key, f]));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {order.map((key, idx) => {
        const meta = fieldMap.get(key);
        if (!meta) return null;
        return (
          <div key={key} className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap min-w-[72px]" style={{ color: '#c4b5fd' }}>
              {meta.label}
            </label>
            <input
              type="number"
              value={form[key] ?? ''}
              onChange={(e) => onChange(key, e.target.value)}
              onBlur={commitReorder}
              className="w-16 px-2 py-1.5 rounded text-sm text-center focus:outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            {idx < order.length - 1 && (
              <span className="text-sm font-semibold px-1" style={{ color: 'var(--c-muted)' }}>
                {'>'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
