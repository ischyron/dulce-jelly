import { Link } from 'react-router-dom';
import { InfoHint } from '../../../InfoHint';
import { SCOUT_MIN_QUALIFIERS_TOOLTIP } from '../../content';
import { Field } from '../../shared/Field';
import type { MinimumQualifiersSectionProps } from '../../types';

export function MinimumQualifiersFields({ form, set }: MinimumQualifiersSectionProps) {
  return (
    <>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Minimum requirements for Scout to work on. This determines your Scout listing view in{' '}
        <Link to="/scout" className="underline" style={{ color: '#c4b5fd' }}>
          Scout Queue
        </Link>
        .
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Critic Score (Min)"
          name="scoutMinCritic"
          value={form.scoutMinCritic ?? '65'}
          onChange={(v) => set('scoutMinCritic', v)}
          placeholder="65"
          tooltip="Jellyfin critic score threshold (0–100)."
        />
        <Field
          label="Min IMDb"
          name="scoutMinCommunity"
          value={form.scoutMinCommunity ?? '7.0'}
          onChange={(v) => set('scoutMinCommunity', v)}
          placeholder="7.0"
        />
        <Field
          label="Scout Batch Size"
          name="scoutSearchBatchSize"
          value={form.scoutSearchBatchSize ?? '5'}
          onChange={(v) => set('scoutSearchBatchSize', v)}
          placeholder="5"
          hint={'Default 5. Hard-capped to 10 server-side to be easy on the indexers.'}
        />
      </div>
    </>
  );
}

export function MinimumQualifiers({ form, set }: MinimumQualifiersSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        Scout Minimum Qualifiers
        <InfoHint label="Scout minimum qualifiers info" text={SCOUT_MIN_QUALIFIERS_TOOLTIP} />
      </h2>
      <MinimumQualifiersFields form={form} set={set} />
    </section>
  );
}
