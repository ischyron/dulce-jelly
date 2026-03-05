import { Tv2 } from 'lucide-react';
import { CLIENT_PROFILES } from '../content';
import type { GeneralPanelProps } from '../types';

export function PlaybackClient({
  clientProfile,
  setClientProfile,
}: Pick<GeneralPanelProps, 'clientProfile' | 'setClientProfile'>) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        <Tv2 size={16} style={{ color: 'var(--c-accent)' }} />
        Primary Playback Client
      </h2>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Drives AV1 compatibility warnings, DV profile badges, and codec scoring in Scout Queue and Library.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {CLIENT_PROFILES.map((p) => (
          <label
            key={p.id}
            className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors"
            style={{
              borderColor: clientProfile === p.id ? 'var(--c-accent)' : 'var(--c-border)',
              background: clientProfile === p.id ? 'rgba(124,58,237,0.1)' : 'var(--c-bg)',
            }}
          >
            <input
              type="radio"
              name="clientProfile"
              value={p.id}
              checked={clientProfile === p.id}
              onChange={() => setClientProfile(p.id)}
              className="mt-0.5 accent-violet-600"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                {p.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
                {p.hint}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--c-muted)', minWidth: '72px' }}>Video codec AV1</span>
                  <span style={{ color: 'var(--c-text)' }}>{p.videoCodec.av1}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--c-muted)', minWidth: '48px' }}>HEVC (H.265)</span>
                  <span style={{ color: 'var(--c-text)' }}>{p.videoCodec.hevc}</span>
                </div>
                <div className="flex items-center gap-1.5 col-span-2">
                  <span style={{ color: 'var(--c-muted)', minWidth: '72px' }}>Dolby Vision</span>
                  <span style={{ color: 'var(--c-text)' }}>{p.dv}</span>
                </div>
              </div>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
