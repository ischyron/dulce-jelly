import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Field } from '../../shared/Field';
import { MaskedKeyField } from '../../shared/MaskedKeyField';
import type { ProwlarrSectionProps } from '../../types';

export function Prowlarr({
  form,
  set,
  checkProwlarrHealth,
  checkingProwlarrHealth,
  prowlarrHealth,
}: ProwlarrSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold" style={{ color: '#d4cfff' }}>
        Prowlarr
      </h2>
      <Field
        label="Prowlarr URL"
        name="prowlarrUrl"
        value={form.prowlarrUrl ?? ''}
        onChange={(v) => set('prowlarrUrl', v)}
        placeholder="http://localhost:9696"
        hint="Used by Scout release search and auto-scout. Also configurable via config/config.yaml (settings.prowlarrUrl)."
      />
      <MaskedKeyField
        label="API Key"
        name="prowlarrApiKey"
        maskedValue={form.prowlarrApiKeyMasked ?? ''}
        value={form.prowlarrApiKey ?? ''}
        onChange={(v) => set('prowlarrApiKey', v)}
        hint="Prowlarr Settings → General → Security → API Key. Also configurable via config/config.yaml (settings.prowlarrApiKey)."
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={checkProwlarrHealth}
          disabled={checkingProwlarrHealth}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}
        >
          {checkingProwlarrHealth ? <Loader2 size={13} className="animate-spin" /> : null}
          Test Connection
        </button>
        {prowlarrHealth &&
          (prowlarrHealth.ok ? (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <CheckCircle size={14} /> Connected — {prowlarrHealth.indexers} indexers
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-red-400">
              <AlertCircle size={14} /> {prowlarrHealth.error}
            </span>
          ))}
      </div>
    </section>
  );
}
