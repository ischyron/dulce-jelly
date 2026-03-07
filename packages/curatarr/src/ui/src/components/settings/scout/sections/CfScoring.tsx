import { InfoHint } from '../../../InfoHint';
import { Field } from '../../shared/Field';
import { OrderedScoreRow } from '../../shared/OrderedScoreRow';
import type { CfScoringSectionProps } from '../../types';

const RESOLUTION_FIELDS = [
  { key: 'scoutPipelineTrashRes2160', label: '2160p' },
  { key: 'scoutPipelineTrashRes1080', label: '1080p' },
  { key: 'scoutPipelineTrashRes720', label: '720p' },
];

const SOURCE_FIELDS = [
  { key: 'scoutPipelineTrashSourceRemux', label: 'Remux' },
  { key: 'scoutPipelineTrashSourceBluray', label: 'BluRay' },
  { key: 'scoutPipelineTrashSourceWebdl', label: 'WEB-DL' },
];

const VIDEO_FIELDS = [
  { key: 'scoutPipelineTrashCodecHevc', label: 'HEVC' },
  { key: 'scoutPipelineTrashCodecAv1', label: 'AV1' },
  { key: 'scoutPipelineTrashCodecH264', label: 'H264' },
];

const AUDIO_FIELDS = [
  { key: 'scoutPipelineTrashAudioAtmos', label: 'Atmos' },
  { key: 'scoutPipelineTrashAudioTruehd', label: 'TrueHD' },
  { key: 'scoutPipelineTrashAudioDts', label: 'DTS' },
  { key: 'scoutPipelineTrashAudioDdp', label: 'DD+ / EAC3' },
  { key: 'scoutPipelineTrashAudioAc3', label: 'AC3' },
  { key: 'scoutPipelineTrashAudioAac', label: 'AAC' },
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
  { n: '3', label: 'TRaSH CF Score', tone: 'linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))' },
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
          text="Curatarr runs this pipeline top-to-bottom: minimum qualifiers (auto-run queue only), basic format scoring, TRaSH CF scoring, custom format overrides and blocking rules, final LLM ruleset, then manual/auto decision."
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
          Baseline deterministic scoring for resolution/video/audio plus a generic bitrate alignment score.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Resolution Match Score"
            name="scoutPipelineBasicResolutionScore"
            value={form.scoutPipelineBasicResolutionScore ?? '6'}
            onChange={(v) => set('scoutPipelineBasicResolutionScore', v)}
          />
          <Field
            label="Video Match Score"
            name="scoutPipelineBasicVideoScore"
            value={form.scoutPipelineBasicVideoScore ?? '5'}
            onChange={(v) => set('scoutPipelineBasicVideoScore', v)}
          />
          <Field
            label="Audio Match Score"
            name="scoutPipelineBasicAudioScore"
            value={form.scoutPipelineBasicAudioScore ?? '4'}
            onChange={(v) => set('scoutPipelineBasicAudioScore', v)}
          />
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
        className="rounded-lg border p-3 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: '#8b87aa' }}
        >
          <StepBadge value="3" tone="linear-gradient(135deg, rgba(59,130,246,0.55), rgba(56,189,248,0.35))" />
          TRaSH Guide CF Scoring
        </div>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Apply deterministic TRaSH-aligned scoring after baseline format scoring.
        </p>
        <OrderedScoreRow fields={RESOLUTION_FIELDS} form={form} onChange={set} />
        <OrderedScoreRow fields={SOURCE_FIELDS} form={form} onChange={set} />
        <OrderedScoreRow fields={VIDEO_FIELDS} form={form} onChange={set} />
        <OrderedScoreRow fields={AUDIO_FIELDS} form={form} onChange={set} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Legacy Penalty"
            name="scoutPipelineTrashLegacyPenalty"
            value={form.scoutPipelineTrashLegacyPenalty ?? '40'}
            onChange={(v) => set('scoutPipelineTrashLegacyPenalty', v)}
          />
          <Field
            label="Usenet Bonus"
            name="scoutPipelineTrashUsenetBonus"
            value={form.scoutPipelineTrashUsenetBonus ?? '10'}
            onChange={(v) => set('scoutPipelineTrashUsenetBonus', v)}
          />
          <Field
            label="Torrent Bonus"
            name="scoutPipelineTrashTorrentBonus"
            value={form.scoutPipelineTrashTorrentBonus ?? '0'}
            onChange={(v) => set('scoutPipelineTrashTorrentBonus', v)}
          />
          <Field
            label="Seeder Divisor"
            name="scoutPipelineTrashSeedersDivisor"
            value={form.scoutPipelineTrashSeedersDivisor ?? '25'}
            onChange={(v) => set('scoutPipelineTrashSeedersDivisor', v)}
          />
          <Field
            label="Seeder Bonus Cap"
            name="scoutPipelineTrashSeedersBonusCap"
            value={form.scoutPipelineTrashSeedersBonusCap ?? '10'}
            onChange={(v) => set('scoutPipelineTrashSeedersBonusCap', v)}
          />
        </div>
      </div>
    </section>
  );
}
