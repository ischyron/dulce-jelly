import { AlertCircle, CheckCircle, FolderOpen, Library as LibraryIcon, Loader2, Minus, Plus, Tv2 } from 'lucide-react';
import { CLIENT_PROFILES } from '../content';
import type { GeneralSettingsContext } from '../types';

export function GeneralSettingsContent({ ctx }: { ctx: GeneralSettingsContext }) {
  const {
    form,
    set,
    Field,
    MaskedKeyField,
    checkJellyfinHealth,
    checkingJellyfinHealth,
    jellyfinHealth,
    movieRoots,
    updateMovieRoot,
    openBrowse,
    removeMovieRoot,
    addMovieRoot,
    clientProfile,
    setClientProfile,
  } = ctx;

  return (
    <>
      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          <img src="/icons/jellyfin.svg" alt="Jellyfin" className="w-4 h-4 brightness-0 invert" />
          Jellyfin Connection
        </h2>
        <Field
          label="Jellyfin URL"
          name="jellyfinUrl"
          value={form.jellyfinUrl ?? ''}
          onChange={(v: string) => set('jellyfinUrl', v)}
          placeholder="http://localhost:8096"
          hint={[
            "Server-side URL — used by Curatarr's backend, not your browser.",
            'Bare-metal / local dev: http://localhost:8096',
            'Docker (same compose stack): http://jellyfin:8096',
            'Docker Desktop on Mac: http://host.docker.internal:8096',
            'Also configurable via config/config.yaml (settings.jellyfinUrl).',
          ].join(' · ')}
        />
        <Field
          label="Jellyfin Public Web URL"
          name="jellyfinPublicUrl"
          value={form.jellyfinPublicUrl ?? ''}
          onChange={(v: string) => set('jellyfinPublicUrl', v)}
          placeholder="https://jellyfin.example.com"
          hint="Browser-facing Jellyfin URL used for Movie detail page links (Open in Jellyfin)."
        />
        <MaskedKeyField
          label="API Key"
          name="jellyfinApiKey"
          maskedValue={form.jellyfinApiKeyMasked ?? ''}
          value={form.jellyfinApiKey ?? ''}
          onChange={(v: string) => set('jellyfinApiKey', v)}
          hint="Jellyfin Dashboard → Administration → API Keys → Add Key. Also configurable via config/config.yaml (settings.jellyfinApiKey)."
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Auto-sync interval (min)"
            name="jfSyncIntervalMin"
            value={form.jfSyncIntervalMin ?? '30'}
            onChange={(v: string) => set('jfSyncIntervalMin', v)}
            placeholder="30"
            hint="Minutes between automatic JF syncs. 0 = disabled. Takes effect after server restart."
          />
          <Field
            label="Sync batch size"
            name="jfSyncBatchSize"
            value={form.jfSyncBatchSize ?? '10'}
            onChange={(v: string) => set('jfSyncBatchSize', v)}
            placeholder="10"
            hint="Items per Jellyfin API page during sync."
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={checkJellyfinHealth}
            disabled={checkingJellyfinHealth}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            {checkingJellyfinHealth ? <Loader2 size={13} className="animate-spin" /> : null}
            Test Connection
          </button>
          {jellyfinHealth &&
            (jellyfinHealth.ok ? (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle size={14} /> Connected — {jellyfinHealth.libraries} libraries
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <AlertCircle size={14} /> {jellyfinHealth.error}
              </span>
            ))}
        </div>
      </section>

      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          <LibraryIcon size={16} style={{ color: 'var(--c-accent)' }} />
          Library Root Folders
        </h2>
        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Movies
          </div>
          {movieRoots.map((value: string, idx: number) => (
            <div key={`movie-root-${value || 'empty'}-${idx}`} className="flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => updateMovieRoot(idx, e.target.value)}
                placeholder="/media/Movies"
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
              <button
                type="button"
                onClick={() => openBrowse(idx)}
                className="px-3 py-2 rounded-lg text-sm flex items-center gap-1"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
                title="Browse folders"
              >
                <FolderOpen size={14} />
                Browse
              </button>
              <button
                type="button"
                onClick={() => removeMovieRoot(idx)}
                className="px-2 py-2 rounded-lg"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
                title="Remove folder"
              >
                <Minus size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addMovieRoot}
            className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            <Plus size={14} />
            Add folder
          </button>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Used by Scan when path override is blank. Configurable via <code>config/config.yaml</code> (
            <code>settings.libraryRoots</code>).
          </p>
        </div>

        <div
          className="rounded-lg border p-3 space-y-2 opacity-80"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Series
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Coming soon
          </p>
        </div>
      </section>

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
    </>
  );
}
