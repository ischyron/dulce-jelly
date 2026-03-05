import { MaskedKeyField } from '../../shared/MaskedKeyField';
import type { LlmProviderSectionProps } from '../../types';

export function LlmProvider({ form, set }: LlmProviderSectionProps) {
  return (
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
        onChange={(v) => set('llmApiKey', v)}
        hint="OpenAI API key. Configure in config/secrets.yaml (llm.apiKey) or save in Settings."
      />
    </section>
  );
}
