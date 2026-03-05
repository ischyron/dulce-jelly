import type { ReactNode, ElementType } from 'react';
import { InfoHint } from '../InfoHint';

interface Props {
  icon: ElementType;
  label: string;
  value: string | number;
  sub?: ReactNode;
  color?: string;
  subWrap?: boolean;
  infoText?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-[#a78bfa]',
  subWrap = false,
  infoText,
}: Props) {
  return (
    <div className="bg-[#16161f] border border-[#26263a] rounded-xl p-4 h-full min-h-[138px] flex flex-col">
      <div className={`flex items-center gap-2 mb-2 text-sm ${color}`}>
        <Icon size={16} />
        <span>{label}</span>
        {infoText && <InfoHint label={`${label} info`} text={infoText} />}
      </div>
      <div className="text-2xl font-bold text-[#f0eeff]">{value}</div>
      <div
        className={`text-xs text-[#6b6888] mt-0.5 min-h-[16px] ${subWrap ? 'leading-5 whitespace-normal break-words' : 'truncate'}`}
        title={typeof sub === 'string' ? sub : undefined}
      >
        {sub ?? ''}
      </div>
    </div>
  );
}
