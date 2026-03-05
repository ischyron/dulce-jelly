import { ArrowDown, Info } from 'lucide-react';
import { InfoHint } from '../../../InfoHint';
import {
  AUDIO_SCORE_FIELDS,
  BITRATE_BIAS_PROFILES,
  BITRATE_GATE_TOOLTIP,
  BITRATE_KEYS,
  BITRATE_PREVIEW_MINUTES,
  BITRATE_PROFILE_DESCRIPTION,
  LEGACY_PENALTY_TOOLTIP,
  RESOLUTION_SCORE_FIELDS,
  SCOUT_CF_SCORING_TOOLTIP,
  SEEDER_DIVISOR_TOOLTIP,
  SEEDER_MAX_BONUS_TOOLTIP,
  SOURCE_SCORE_FIELDS,
  VIDEO_CODEC_SCORE_FIELDS,
} from '../../content';
import { BitrateBandField } from '../../shared/BitrateBandField';
import { Field } from '../../shared/Field';
import { OrderedScoreRow } from '../../shared/OrderedScoreRow';
import type { CfScoringSectionProps } from '../../types';
import { MinimumQualifiersFields } from './MinimumQualifiers';

export function CfScoring({
  form,
  set,
  activeProfileLabel,
  activeProfileAv1,
  bitrateProfileId,
  setBitrateProfileId,
  applyBitrateProfile,
  selectedBitrateProfile,
  detectedBitrateProfile,
}: CfScoringSectionProps) {
  const pipelineSteps = [
    {
      title: 'Scout Minimum Qualifiers',
      detail: 'Gate the candidate pool with MC/IMDb thresholds and batch size.',
      tone: 'linear-gradient(135deg, rgba(99,102,241,0.55), rgba(129,140,248,0.35))',
    },
    {
      title: 'TRaSH Guide CF scoring',
      detail: 'Apply baseline deterministic scoring from TRaSH-aligned rules.',
      tone: 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))',
    },
    {
      title: 'Custom CF + blockers',
      detail: 'Apply your overrides and release blockers (feature-flagged path).',
      tone: 'linear-gradient(135deg, rgba(16,185,129,0.55), rgba(52,211,153,0.35))',
    },
    {
      title: 'Final LLM rule set',
      detail: 'Drop weak candidates and break close-score ties.',
      tone: 'linear-gradient(135deg, rgba(245,158,11,0.55), rgba(251,191,36,0.35))',
    },
    {
      title: 'Final choice',
      detail: 'Surface the strongest final recommendation for action.',
      tone: 'linear-gradient(135deg, rgba(236,72,153,0.55), rgba(244,114,182,0.35))',
    },
  ] as const;

  const stepPill = (stepLabel: string, tone: string) => (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{
        background: tone,
        border: '1px solid rgba(224,231,255,0.7)',
        color: '#ffffff',
        boxShadow: '0 0 0 1px rgba(15,23,42,0.35) inset',
      }}
    >
      {stepLabel}
    </span>
  );

  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        Scout pipeline
        <InfoHint label="CF scoring info" text={SCOUT_CF_SCORING_TOOLTIP} />
      </h2>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Curatarr runs this pipeline from top to bottom. Higher score means releases with those attributes are more
        likely to be selected.{' '}
        <a
          href="https://github.com/ischyron/dulce-jelly/blob/main/packages/curatarr/docs/scout-approach.md"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#c4b5fd', textDecoration: 'underline' }}
        >
          Learn More
        </a>
      </p>
      <details
        className="rounded-xl border text-xs"
        style={{ borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(15,23,42,0.35)', color: 'var(--c-muted)' }}
      >
        <summary
          className="cursor-pointer list-none px-4 py-3 flex items-center justify-between"
          style={{ color: '#ddd6fe' }}
        >
          <span className="font-semibold">Target pipeline</span>
          <span className="text-[11px]" style={{ color: '#c4b5fd' }}>
            Expand
          </span>
        </summary>
        <div className="p-4 pt-0 space-y-2">
          {pipelineSteps.map((step, idx) => (
            <div key={step.title} className="space-y-2">
              <div
                className="rounded-lg border p-3"
                style={{ borderColor: 'rgba(196,181,253,0.3)', background: 'rgba(15,23,42,0.58)' }}
              >
                <div className="flex items-center gap-2">
                  {stepPill(String(idx), step.tone)}
                  <span className="font-semibold" style={{ color: '#e9d5ff' }}>
                    {step.title}
                  </span>
                </div>
                <div className="text-[11px] mt-1.5 pl-8" style={{ color: '#c4b5fd' }}>
                  {step.detail}
                </div>
              </div>
              {idx < pipelineSteps.length - 1 && (
                <div className="flex justify-center" style={{ color: '#a78bfa' }}>
                  <ArrowDown size={14} />
                </div>
              )}
            </div>
          ))}
        </div>
      </details>
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.05)' }}
      >
        <div
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: '#c4b5fd' }}
        >
          {stepPill('0', 'linear-gradient(135deg, rgba(99,102,241,0.55), rgba(129,140,248,0.35))')}
          Scout Minimum Qualifiers
        </div>
        <MinimumQualifiersFields form={form} set={set} />
      </div>
      <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
        Source of truth: <code>config/scoring.yaml</code>. Saving settings also syncs this file.
      </p>
      <div className="space-y-3">
        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Resolution
          </div>
          <OrderedScoreRow fields={RESOLUTION_SCORE_FIELDS} form={form} onChange={set} />
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Source
          </div>
          <OrderedScoreRow fields={SOURCE_SCORE_FIELDS} form={form} onChange={set} />
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Video
          </div>
          <OrderedScoreRow fields={VIDEO_CODEC_SCORE_FIELDS} form={form} onChange={set} />
          <div
            className="flex items-start gap-2 p-3 rounded-lg text-xs"
            style={{
              background: 'rgba(139,135,170,0.08)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-muted)',
            }}
          >
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              AV1 files score highest (100) for compression efficiency. Scout Queue and Library will show a
              compatibility warning for AV1 files when your selected primary client lacks hardware AV1 decode. Active
              profile: <em style={{ color: 'var(--c-text)' }}>{activeProfileLabel}</em> — Video codec AV1:{' '}
              <span style={{ color: 'var(--c-text)' }}>{activeProfileAv1}</span>.
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Legacy Penalty"
              name="scoutCfLegacyPenalty"
              value={form.scoutCfLegacyPenalty ?? '30'}
              onChange={(v) => set('scoutCfLegacyPenalty', v)}
              tooltip={LEGACY_PENALTY_TOOLTIP}
            />
          </div>
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Audio
          </div>
          <OrderedScoreRow fields={AUDIO_SCORE_FIELDS} form={form} onChange={set} />
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Curatarr Recommended Bitrate Profiles
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            {BITRATE_PROFILE_DESCRIPTION}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label
                htmlFor="bitrate-profile-select"
                className="text-sm font-medium mb-1 block"
                style={{ color: '#c4b5fd' }}
              >
                Profile
              </label>
              <select
                id="bitrate-profile-select"
                name="bitrateProfileSelect"
                value={bitrateProfileId}
                onChange={(e) => setBitrateProfileId(e.target.value as typeof bitrateProfileId)}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              >
                {BITRATE_BIAS_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => applyBitrateProfile(bitrateProfileId)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                background: 'rgba(124,58,237,0.18)',
                border: '1px solid rgba(124,58,237,0.45)',
                color: '#ddd6fe',
              }}
            >
              Apply Profile
            </button>
          </div>
          <div
            className="rounded-lg border p-3 text-xs space-y-1"
            style={{
              borderColor: 'var(--c-border)',
              background: 'rgba(139,135,170,0.08)',
              color: 'var(--c-muted)',
            }}
          >
            <div>{selectedBitrateProfile.summary}</div>
            <div>
              Preview ({BITRATE_PREVIEW_MINUTES}min): 2160p {selectedBitrateProfile.values.min2160}-
              {selectedBitrateProfile.values.max2160} Mbps · 1080p {selectedBitrateProfile.values.min1080}-
              {selectedBitrateProfile.values.max1080} Mbps · 720p {selectedBitrateProfile.values.min720}-
              {selectedBitrateProfile.values.max720} Mbps
            </div>
            <div>
              &lt;720p uses fallback band ({selectedBitrateProfile.values.minOther}-
              {selectedBitrateProfile.values.maxOther} Mbps).
            </div>
            {detectedBitrateProfile == null && <div style={{ color: '#f5d0fe' }}>Current state: Custom</div>}
          </div>
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Bitrate Gates (Adjust below)
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            Bitrate includes video + audio streams. Curatarr tuning is focused on 720p, 1080p, and 2160p.
          </p>
          <div className="space-y-3">
            <BitrateBandField
              label="2160p"
              minName={BITRATE_KEYS.min2160}
              maxName={BITRATE_KEYS.max2160}
              minValue={form[BITRATE_KEYS.min2160] ?? '10'}
              maxValue={form[BITRATE_KEYS.max2160] ?? '35'}
              onChange={set}
              minLimit={0}
              maxLimit={120}
              step={0.5}
              tooltip={BITRATE_GATE_TOOLTIP}
            />
            <BitrateBandField
              label="1080p"
              minName={BITRATE_KEYS.min1080}
              maxName={BITRATE_KEYS.max1080}
              minValue={form[BITRATE_KEYS.min1080] ?? '4'}
              maxValue={form[BITRATE_KEYS.max1080] ?? '15'}
              onChange={set}
              minLimit={0}
              maxLimit={60}
              step={0.5}
              tooltip={BITRATE_GATE_TOOLTIP}
            />
            <BitrateBandField
              label="720p"
              minName={BITRATE_KEYS.min720}
              maxName={BITRATE_KEYS.max720}
              minValue={form[BITRATE_KEYS.min720] ?? '2.5'}
              maxValue={form[BITRATE_KEYS.max720] ?? '8'}
              onChange={set}
              minLimit={0}
              maxLimit={40}
              step={0.5}
              tooltip={BITRATE_GATE_TOOLTIP}
            />
            <BitrateBandField
              label="Other (<720p fallback)"
              minName={BITRATE_KEYS.minOther}
              maxName={BITRATE_KEYS.maxOther}
              minValue={form[BITRATE_KEYS.minOther] ?? '1'}
              maxValue={form[BITRATE_KEYS.maxOther] ?? '12'}
              onChange={set}
              minLimit={0}
              maxLimit={30}
              step={0.25}
              tooltip={BITRATE_GATE_TOOLTIP}
            />
          </div>
        </div>

        <div
          className="rounded-lg border p-3 space-y-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
        >
          <div
            className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
            style={{ color: '#8b87aa' }}
          >
            {stepPill('1', 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))')}
            TRaSH Guide CF scoring · Protocol & Availability
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field
              label="Usenet Bonus"
              name="scoutCfUsenetBonus"
              value={form.scoutCfUsenetBonus ?? '10'}
              onChange={(v) => set('scoutCfUsenetBonus', v)}
            />
            <Field
              label="Torrent Bonus"
              name="scoutCfTorrentBonus"
              value={form.scoutCfTorrentBonus ?? '0'}
              onChange={(v) => set('scoutCfTorrentBonus', v)}
            />
            <Field
              label="Seeder Divisor"
              name="scoutCfSeedersDivisor"
              value={form.scoutCfSeedersDivisor ?? '20'}
              onChange={(v) => set('scoutCfSeedersDivisor', v)}
              tooltip={SEEDER_DIVISOR_TOOLTIP}
            />
            <Field
              label="Seeder Max Bonus"
              name="scoutCfSeedersBonusCap"
              value={form.scoutCfSeedersBonusCap ?? '12'}
              onChange={(v) => set('scoutCfSeedersBonusCap', v)}
              tooltip={SEEDER_MAX_BONUS_TOOLTIP}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
