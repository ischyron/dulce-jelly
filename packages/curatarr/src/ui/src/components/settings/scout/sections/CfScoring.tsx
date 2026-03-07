import { InfoHint } from '../../../InfoHint';
import { Field } from '../../shared/Field';
import { OrderedScoreRow } from '../../shared/OrderedScoreRow';
import type { CfScoringSectionProps } from '../../types';

const RESOLUTION_FIELDS = [
  { key: 'scoutPipelineBasicRes2160', label: '2160p' },
  { key: 'scoutPipelineBasicRes1080', label: '1080p' },
  { key: 'scoutPipelineBasicRes720', label: '720p' },
];

const SOURCE_QUALITY_FIELDS = [
  { key: 'scoutPipelineBasicSourceRemux', label: 'Remux' },
  { key: 'scoutPipelineBasicSourceBluray', label: 'BluRay' },
  { key: 'scoutPipelineBasicSourceWebdl', label: 'WEB-DL' },
];

const VIDEO_FIELDS = [
  { key: 'scoutPipelineBasicVideoHevc', label: 'HEVC' },
  { key: 'scoutPipelineBasicVideoAv1', label: 'AV1' },
  { key: 'scoutPipelineBasicVideoH264', label: 'H264' },
];

const AUDIO_FIELDS = [
  { key: 'scoutPipelineBasicAudioAtmos', label: 'Atmos' },
  { key: 'scoutPipelineBasicAudioTruehd', label: 'TrueHD' },
  { key: 'scoutPipelineBasicAudioDts', label: 'DTS' },
  { key: 'scoutPipelineBasicAudioDdp', label: 'DD+ / EAC3' },
  { key: 'scoutPipelineBasicAudioAc3', label: 'AC3' },
  { key: 'scoutPipelineBasicAudioAac', label: 'AAC' },
];

function StepBadge({ value, tone }: { value: string; tone: string }) {
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
      style={{ background: tone, color: '#fff', border: '1px solid rgba(224,231,255,0.7)' }}
    >
      {value}
    </span>
  );
}

const PIPELINE_STEPS = [
  {
    n: '1',
    label: 'Minimum Qualifiers',
    tone: 'linear-gradient(135deg, rgba(99,102,241,0.55), rgba(129,140,248,0.35))',
  },
  { n: '2', label: 'Basic Format Score', tone: 'linear-gradient(135deg, rgba(34,197,94,0.55), rgba(74,222,128,0.35))' },
  {
    n: '3',
    label: 'TRaSH Baseline (Read-only)',
    tone: 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))',
  },
  {
    n: '4',
    label: 'Additional Custom Format Scores & Blocking Rules',
    tone: 'linear-gradient(135deg, rgba(124,58,237,0.55), rgba(167,139,250,0.35))',
  },
  {
    n: '5',
    label: 'Final LLM Ruleset',
    tone: 'linear-gradient(135deg, rgba(251,146,60,0.55), rgba(253,186,116,0.35))',
  },
  {
    n: '6',
    label: 'Manual/Auto Decision',
    tone: 'linear-gradient(135deg, rgba(244,63,94,0.55), rgba(251,113,133,0.35))',
  },
];

export function CfScoring({ form, set }: CfScoringSectionProps) {
  return (
    <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
      <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
        Scout Quality Pipeline
        <InfoHint
          label="Scout pipeline info"
          text="Curatarr runs this pipeline top-to-bottom: minimum qualifiers (auto-run queue only), deterministic basic format scoring, TRaSH baseline sync (read-only), custom format overrides/blockers, final LLM ruleset, then manual/auto decision."
        />
      </h2>

      <div
        className="rounded-lg border p-3"
        style={{
          borderColor: 'var(--c-border)',
          background: 'linear-gradient(180deg, rgba(124,58,237,0.08), rgba(15,23,42,0.35))',
        }}
      >
        <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: '#8b87aa' }}>
          Quality Funnel
        </div>
        <div className="space-y-1">
          {PIPELINE_STEPS.map((step, idx) => (
            <div key={step.n} className="flex flex-col items-center">
              {(() => {
                const widthPct = Math.max(62, 100 - idx * 8);
                return (
                  <div
                    className="rounded-md px-3 py-1.5 text-xs font-semibold flex items-center gap-2"
                    style={{
                      width: `${widthPct}%`,
                      color: '#d4cfff',
                      border: '1px solid rgba(196,181,253,0.35)',
                      background: step.tone,
                    }}
                  >
                    <StepBadge value={step.n} tone="rgba(15,23,42,0.55)" />
                    <span>{step.label}</span>
                  </div>
                );
              })()}
              {idx < PIPELINE_STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="h-3"
                  style={{
                    width: `${Math.max(58, 92 - idx * 8)}%`,
                    background: 'linear-gradient(180deg, rgba(196,181,253,0.45), rgba(139,92,246,0.24))',
                    clipPath: 'polygon(8% 0, 92% 0, 78% 100%, 22% 100%)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8b87aa' }}
        >
          <StepBadge value="1" tone="linear-gradient(135deg, rgba(99,102,241,0.55), rgba(129,140,248,0.35))" />
          Scout Minimum Qualifiers
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Gate the candidate pool with MC/IMDb thresholds and batch size.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Applies to the auto-run queue only. You can manually scout releases for any item.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Min MC (Metacritic)"
            name="scoutPipelineMinCritic"
            value={form.scoutPipelineMinCritic ?? '65'}
            onChange={(v) => set('scoutPipelineMinCritic', v)}
            placeholder="65"
          />
          <Field
            label="Min IMDb"
            name="scoutPipelineMinImdb"
            value={form.scoutPipelineMinImdb ?? '7.0'}
            onChange={(v) => set('scoutPipelineMinImdb', v)}
            placeholder="7.0"
          />
          <Field
            label="Batch Size"
            name="scoutPipelineBatchSize"
            value={form.scoutPipelineBatchSize ?? '5'}
            onChange={(v) => set('scoutPipelineBatchSize', v)}
            placeholder="5"
            hint="Hard max 10 enforced server-side."
          />
        </div>
      </div>

      <div
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8b87aa' }}
        >
          <StepBadge value="2" tone="linear-gradient(135deg, rgba(34,197,94,0.55), rgba(74,222,128,0.35))" />
          Scout Basic Format Scoring
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Deterministic scoring using ordered ladders for resolution/source/video/audio plus bitrate alignment and
          source preference controls.
        </p>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Resolution
          </div>
          <OrderedScoreRow fields={RESOLUTION_FIELDS} form={form} onChange={set} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Quality Source
          </div>
          <OrderedScoreRow fields={SOURCE_QUALITY_FIELDS} form={form} onChange={set} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Video
          </div>
          <OrderedScoreRow fields={VIDEO_FIELDS} form={form} onChange={set} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Audio
          </div>
          <OrderedScoreRow fields={AUDIO_FIELDS} form={form} onChange={set} />
        </div>

        <div
          className="rounded border p-2 space-y-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Bitrate Alignment
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field
              label="Target Bitrate (Mbps)"
              name="scoutPipelineBitrateTargetMbps"
              value={form.scoutPipelineBitrateTargetMbps ?? '18'}
              onChange={(v) => set('scoutPipelineBitrateTargetMbps', v)}
            />
            <Field
              label="Tolerance (%)"
              name="scoutPipelineBitrateTolerancePct"
              value={form.scoutPipelineBitrateTolerancePct ?? '40'}
              onChange={(v) => set('scoutPipelineBitrateTolerancePct', v)}
              hint="Closer to target bitrate yields higher alignment score."
            />
            <Field
              label="Bitrate Max Score"
              name="scoutPipelineBitrateMaxScore"
              value={form.scoutPipelineBitrateMaxScore ?? '12'}
              onChange={(v) => set('scoutPipelineBitrateMaxScore', v)}
            />
          </div>
        </div>

        <div
          className="rounded border p-2 space-y-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Compatibility & Availability
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Legacy Penalty"
              name="scoutPipelineBasicLegacyPenalty"
              value={form.scoutPipelineBasicLegacyPenalty ?? '40'}
              onChange={(v) => set('scoutPipelineBasicLegacyPenalty', v)}
            />
            <Field
              label="Seeder Divisor"
              name="scoutPipelineBasicSeedersDivisor"
              value={form.scoutPipelineBasicSeedersDivisor ?? '25'}
              onChange={(v) => set('scoutPipelineBasicSeedersDivisor', v)}
            />
            <Field
              label="Seeder Bonus Cap"
              name="scoutPipelineBasicSeedersBonusCap"
              value={form.scoutPipelineBasicSeedersBonusCap ?? '10'}
              onChange={(v) => set('scoutPipelineBasicSeedersBonusCap', v)}
            />
          </div>
        </div>

        <div
          className="rounded border p-2 space-y-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Source
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Usenet Bonus"
              name="scoutPipelineBasicUsenetBonus"
              value={form.scoutPipelineBasicUsenetBonus ?? '10'}
              onChange={(v) => set('scoutPipelineBasicUsenetBonus', v)}
            />
            <Field
              label="Torrent Bonus"
              name="scoutPipelineBasicTorrentBonus"
              value={form.scoutPipelineBasicTorrentBonus ?? '0'}
              onChange={(v) => set('scoutPipelineBasicTorrentBonus', v)}
            />
          </div>
        </div>
      </div>

      <div
        className="rounded-lg border p-3 space-y-2"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8b87aa' }}
        >
          <StepBadge value="3" tone="linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))" />
          TRaSH Baseline (Read-only)
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Step 3 is informational only. Use the collapsed TRaSH section below to review sync metadata and baseline
          status.
        </p>
      </div>
    </section>
  );
}
