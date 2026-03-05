import { AlertTriangle } from 'lucide-react';

const LEGACY_CODECS = new Set(['mpeg4', 'mpeg2video', 'msmpeg4v3']);
const AV1_TV_WARN_PROFILES = new Set(['android_tv', 'fire_tv']);

interface Props {
  codec: string | null;
}

export function CompatTag({ codec }: Props) {
  if (!codec) return null;
  const k = codec.toLowerCase();
  const profile = (() => {
    try {
      return localStorage.getItem('clientProfile') ?? 'android_tv';
    } catch {
      return 'android_tv';
    }
  })();

  if (k === 'av1' && AV1_TV_WARN_PROFILES.has(profile)) {
    return (
      <span title="AV1 not hardware-decoded on this client" className="inline-flex items-center gap-0.5 text-xs text-amber-400">
        <AlertTriangle size={11} /> AV1 compat
      </span>
    );
  }
  if (LEGACY_CODECS.has(k)) {
    return (
      <span title="Legacy codec — replace recommended" className="inline-flex items-center gap-0.5 text-xs text-orange-400">
        <AlertTriangle size={11} /> legacy
      </span>
    );
  }
  return null;
}
