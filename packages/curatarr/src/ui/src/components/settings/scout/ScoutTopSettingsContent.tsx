import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InfoHint } from '../../InfoHint';
import { SCOUT_MIN_QUALIFIERS_TOOLTIP } from '../content';
import type { ScoutTopSettingsContext } from '../types';

export function ScoutTopSettingsContent({ ctx }: { ctx: ScoutTopSettingsContext }) {
  const { form, set, Field, MaskedKeyField, checkProwlarrHealth, checkingProwlarrHealth, prowlarrHealth } = ctx;

  return (
    <>
      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>
          Prowlarr
        </h2>
        <Field
          label="Prowlarr URL"
          name="prowlarrUrl"
          value={form.prowlarrUrl ?? ''}
          onChange={(v: string) => set('prowlarrUrl', v)}
          placeholder="http://localhost:9696"
          hint="Used by Scout release search and auto-scout. Also configurable via config/config.yaml (settings.prowlarrUrl)."
        />
        <MaskedKeyField
          label="API Key"
          name="prowlarrApiKey"
          maskedValue={form.prowlarrApiKeyMasked ?? ''}
          value={form.prowlarrApiKey ?? ''}
          onChange={(v: string) => set('prowlarrApiKey', v)}
          hint="Prowlarr Settings → General → Security → API Key. Also configurable via config/config.yaml (settings.prowlarrApiKey)."
        />
        <div className="flex items-center gap-3">
          <button
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

      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>
          LLM Provider (Optional)
        </h2>
        <div className="space-y-1">
          <label className="text-sm font-medium" style={{ color: '#c4b5fd' }}>
            Provider
          </label>
          <input
            value="openai"
            disabled
            className="w-full px-3 py-2 rounded-lg text-sm opacity-85 cursor-not-allowed"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Optional: used to filter Scout results more intelligently, break near-score ties, and bias recommendations
            toward your selected playback client preferences.
          </p>
        </div>
        <MaskedKeyField
          label="API Key"
          name="llmApiKey"
          maskedValue={form.llmApiKeyMasked ?? ''}
          value={form.llmApiKey ?? ''}
          onChange={(v: string) => set('llmApiKey', v)}
          hint="OpenAI API key. Configure in config/secrets.yaml (llm.apiKey) or save in Settings."
        />
      </section>

      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          Scout Minimum Qualifiers
          <InfoHint label="Scout minimum qualifiers info" text={SCOUT_MIN_QUALIFIERS_TOOLTIP} />
        </h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Minimum requirements for Scout to work on. This determines your Scout listing view in{' '}
          <Link to="/scout" className="underline" style={{ color: '#c4b5fd' }}>
            Scout Queue
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min MC (Metacritic)"
            name="scoutMinCritic"
            value={form.scoutMinCritic ?? '65'}
            onChange={(v: string) => set('scoutMinCritic', v)}
            placeholder="65"
          />
          <Field
            label="Min IMDb"
            name="scoutMinCommunity"
            value={form.scoutMinCommunity ?? '7.0'}
            onChange={(v: string) => set('scoutMinCommunity', v)}
            placeholder="7.0"
          />
          <Field
            label="Scout Batch Size"
            name="scoutSearchBatchSize"
            value={form.scoutSearchBatchSize ?? '5'}
            onChange={(v: string) => set('scoutSearchBatchSize', v)}
            placeholder="5"
            hint={'Default 5. Hard-capped to 10 server-side to be easy on the indexers.'}
          />
        </div>
      </section>
    </>
  );
}
