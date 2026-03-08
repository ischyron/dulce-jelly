import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Field } from '../shared/Field';
import { MaskedKeyField } from '../shared/MaskedKeyField';
import type { GeneralPanelProps } from '../types';

export function Connection({
  form,
  set,
  checkJellyfinHealth,
  checkingJellyfinHealth,
  jellyfinHealth,
}: Pick<GeneralPanelProps, 'form' | 'set' | 'checkJellyfinHealth' | 'checkingJellyfinHealth' | 'jellyfinHealth'>) {
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
          onChange={(v) => set('jellyfinUrl', v)}
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
          onChange={(v) => set('jellyfinPublicUrl', v)}
          placeholder="https://jellyfin.example.com"
          hint="Browser-facing Jellyfin URL used for Movie detail page links (Open in Jellyfin)."
        />
        <MaskedKeyField
          label="API Key"
          name="jellyfinApiKey"
          maskedValue={form.jellyfinApiKeyMasked ?? ''}
          value={form.jellyfinApiKey ?? ''}
          onChange={(v) => set('jellyfinApiKey', v)}
          hint="Jellyfin Dashboard → Administration → API Keys → Add Key. Also configurable via config/config.yaml (settings.jellyfinApiKey)."
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Auto-sync interval (min)"
            name="jfSyncIntervalMin"
            value={form.jfSyncIntervalMin ?? '30'}
            onChange={(v) => set('jfSyncIntervalMin', v)}
            placeholder="30"
            hint="Minutes between automatic JF syncs. 0 = disabled. Takes effect after server restart."
          />
          <Field
            label="Sync batch size"
            name="jfSyncBatchSize"
            value={form.jfSyncBatchSize ?? '10'}
            onChange={(v) => set('jfSyncBatchSize', v)}
            placeholder="10"
            hint="Items per Jellyfin API page during sync."
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
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
    </>
  );
}
