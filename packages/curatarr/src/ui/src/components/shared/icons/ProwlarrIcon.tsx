import type { ImgHTMLAttributes } from 'react';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  size?: number;
}

export function ProwlarrIcon({ size = 16, className, ...props }: Props) {
  return (
    <img
      {...props}
      src="/icons/prowlarr.png"
      alt="Prowlarr"
      width={size}
      height={size}
      className={['shrink-0 object-contain', className].filter(Boolean).join(' ')}
    />
  );
}
