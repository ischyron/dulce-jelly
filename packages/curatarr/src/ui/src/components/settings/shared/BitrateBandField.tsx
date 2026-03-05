import { InfoHint } from '../../InfoHint';
import { BITRATE_PREVIEW_MINUTES } from '../content';
import { bitrateToSizeGb, formatGigabytes } from '../utils/format';

export function BitrateBandField({
  label,
  minName,
  maxName,
  minValue,
  maxValue,
  onChange,
  minLimit,
  maxLimit,
  step = 0.5,
  tooltip = '',
  minutes = BITRATE_PREVIEW_MINUTES,
}: {
  label: string;
  minName: string;
  maxName: string;
  minValue: string;
  maxValue: string;
  onChange: (key: string, v: string) => void;
  minLimit: number;
  maxLimit: number;
  step?: number;
  tooltip?: string;
  minutes?: number;
}) {
  const parsedMin = Number.isFinite(Number(minValue)) ? Number(minValue) : minLimit;
  const parsedMax = Number.isFinite(Number(maxValue)) ? Number(maxValue) : maxLimit;
  const safeMin = Math.min(parsedMin, parsedMax);
  const safeMax = Math.max(parsedMin, parsedMax);
  const shownMin = step < 1 ? safeMin.toFixed(1) : String(Math.round(safeMin));
  const shownMax = step < 1 ? safeMax.toFixed(1) : String(Math.round(safeMax));
  const estMin = formatGigabytes(bitrateToSizeGb(safeMin, minutes));
  const estMax = formatGigabytes(bitrateToSizeGb(safeMax, minutes));

  return (
    <div>
      <label className="text-sm font-medium mb-1 flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
        <span className="whitespace-nowrap">{label}</span>
        {tooltip && <InfoHint label={`${label} info`} text={tooltip} />}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-muted)' }}>
            Min
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              name={minName}
              min={minLimit}
              max={maxLimit}
              step={step}
              value={safeMin}
              onChange={(e) => onChange(minName, e.target.value)}
              className="w-full"
            />
            <span className="text-xs font-mono min-w-[4rem] text-right" style={{ color: 'var(--c-text)' }}>
              {shownMin}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-muted)' }}>
            Max
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              name={maxName}
              min={minLimit}
              max={maxLimit}
              step={step}
              value={safeMax}
              onChange={(e) => onChange(maxName, e.target.value)}
              className="w-full"
            />
            <span className="text-xs font-mono min-w-[4rem] text-right" style={{ color: 'var(--c-text)' }}>
              {shownMax}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--c-muted)' }}>
        Typical file size for {minutes}min video: {estMin}–{estMax}
      </p>
    </div>
  );
}
