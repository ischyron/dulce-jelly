import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Settings2, CheckCircle, AlertCircle, Loader2, Info, Tv2, ScanLine, Eye, EyeOff, Pencil, X, ChevronDown, Link2, Bot, Library as LibraryIcon } from 'lucide-react';
import { api } from '../api/client.js';
import { InfoHint } from '../components/InfoHint.js';

// ── Client profile definitions ────────────────────────────────────────

const CLIENT_PROFILES = [
  {
    id: 'android_tv',
    label: 'Android TV / Google TV (default)',
    videoCodec: { av1: 'No hardware decode', hevc: 'Full', h264: 'Full' },
    dv: 'App-level via Jellyfin (Profile 5, Profile 8)',
    hint: 'Chromecast HD, older Android TV sticks. AV1 will be software-transcoded — use H264/HEVC files for best performance.',
  },
  {
    id: 'chromecast_4k',
    label: 'Chromecast with Google TV 4K (2022+)',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 8',
    hint: 'Full AV1 hardware decode. Dolby Vision Profile 5 and Profile 8 supported.',
  },
  {
    id: 'apple_tv',
    label: 'Apple TV 4K (3rd gen)',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 8 · No HDR10+',
    hint: 'Full AV1 hardware decode. Dolby Vision Profile 5/8 only — HDR10+ not supported.',
  },
  {
    id: 'shield',
    label: 'NVIDIA SHIELD',
    videoCodec: { av1: 'Full hardware', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 5, Profile 7, Profile 8',
    hint: 'Most capable TV client. Full AV1 hardware decode. Dolby Vision including Profile 7 (FEL) supported.',
  },
  {
    id: 'fire_tv',
    label: 'Fire TV Stick 4K Max',
    videoCodec: { av1: 'Software only', hevc: 'Full', h264: 'Full' },
    dv: 'Dolby Vision (DV) Profile 8 via Dolby MAL',
    hint: 'AV1 is software-decoded on most models — HEVC is preferred. Dolby Vision Profile 8 via MAL.',
  },
];

// ── Scoring tooltip content ────────────────────────────────────────────

const CODEC_SCORING_TOOLTIP = `Video codec quality scores (compression efficiency):
  AV1   = 100 — best compression; hardware support varies by client
  HEVC (H.265) = 90  — preferred for 4K/HDR; near-universal TV support
  H264  = 70  — universally compatible
  MPEG4 = 40  — legacy; replacement recommended
  MPEG2 = 20  — very old; avoid

⚠ Scout Queue and Library show a compatibility warning
  when an AV1 file is paired with a client that lacks
  hardware AV1 decode (software transcode = CPU load).`;

const SCOUT_CF_SCORING_TOOLTIP = `Scout release scoring (CF-style) is additive:
  Score = Resolution + Source + Codec + Protocol + Seeder bonus - Penalties

Resolution weights:
  2160p, 1080p, 720p
Source weights:
  Remux, BluRay, WEB-DL
Codec weights:
  HEVC, AV1, H264
Audio weights:
  Atmos, TrueHD, DTS, DD+/EAC3, AC3, AAC
Protocol weights:
  Usenet bonus, Torrent bonus
Penalties:
  Legacy codec penalty (xvid/mpeg4)
  Small-4K penalty when size < Small 4K Min GiB
Bitrate gate:
  Hard exclude releases outside Min/Max bitrate window
Availability:
  Seeder bonus = floor(seeders / divisor), capped by max bonus

These settings affect Scout release ranking (search results), not the Library candidate priority score.`;

const LEGACY_PENALTY_TOOLTIP = `Subtracts points from releases that use legacy codecs (xvid/mpeg4/mpeg2).

Higher value = stronger penalty (legacy files drop lower in Scout ranking).
Lower value = legacy files are penalized less.`;

const SEEDER_DIVISOR_TOOLTIP = `Seeder bonus uses this formula:
  bonus = floor(seeders / divisor), then capped by "Seeder Max Bonus".

Lower divisor boosts seed-heavy torrents more aggressively.
Higher divisor makes seeders matter less in final score.`;

const SEEDER_MAX_BONUS_TOOLTIP = `Caps how many points seeders can add to score.

Formula:
  seederBonus = floor(seeders / Seeder Divisor)
  finalSeederBonus = min(seederBonus, Seeder Max Bonus)

Example:
  divisor = 25, max bonus = 10
  80 seeders -> floor(80/25)=3 points
  500 seeders -> floor(500/25)=20 -> capped to 10 points

This prevents very high-seed releases from overpowering quality/source signals.`;

const BITRATE_GATE_TOOLTIP = `Hard exclusion by estimated bitrate (size/duration) in Scout search results.

Min bitrate: releases below this are excluded.
Max bitrate: releases above this are excluded.

Estimated bitrate is compared after resolution/codec normalization, so these
bounds act as a global safety clamp.`;

const SCOUT_OBJECTIVE_SAMPLES = [
  'Keep 4K quality high, but avoid fake quality claims from unknown groups.',
  'Prioritize playback compatibility for Android TV and Chromecast devices.',
  'Prefer WEB-DL over WEBRip and reduce transcode-heavy picks.',
  'Storage-efficient upgrades: avoid oversized remux unless title is exceptional.',
  'Usenet-first policy with safe torrent fallback only when needed.',
];

const SCOUT_PRESET_SAMPLES: Array<{
  id: string;
  title: string;
  summary: string;
  objective: string;
  settingsPatch: Record<string, string>;
}> = [
  {
    id: 'balanced',
    title: 'Balanced 4K',
    summary: 'Quality-first, keeps strong penalties for legacy/suspicious releases.',
    objective: 'Balance 4K quality, authenticity, and compatibility.',
    settingsPatch: {
      scoutCfRes2160: '46',
      scoutCfSourceRemux: '34',
      scoutCfSourceBluray: '22',
      scoutCfSourceWebdl: '14',
      scoutCfLegacyPenalty: '40',
      scoutCfSmall4kPenalty: '20',
    },
  },
  {
    id: 'compat',
    title: 'Compatibility First',
    summary: 'De-prioritize AV1 and transcode-heavy outcomes for TV clients.',
    objective: 'Prioritize compatibility on Android TV / Google TV clients.',
    settingsPatch: {
      scoutCfCodecAv1: '6',
      scoutCfCodecH264: '14',
      scoutCfCodecHevc: '20',
      scoutCfSmall4kPenalty: '24',
    },
  },
  {
    id: 'storage',
    title: 'Storage Saver',
    summary: 'Reduce oversized upgrades while still targeting meaningful quality gains.',
    objective: 'Optimize for storage efficiency and practical upgrades.',
    settingsPatch: {
      scoutCfSourceRemux: '22',
      scoutCfSmall4kPenalty: '28',
      scoutCfSmall4kMinGiB: '12',
      scoutCfSeedersBonusCap: '8',
    },
  },
];

interface ScoutRuleDraft {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  configText: string;
}

interface OrderedScoreField {
  key: string;
  label: string;
}

const RESOLUTION_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfRes2160', label: '2160p' },
  { key: 'scoutCfRes1080', label: '1080p' },
  { key: 'scoutCfRes720', label: '720p' },
];

const SOURCE_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfSourceRemux', label: 'Remux' },
  { key: 'scoutCfSourceBluray', label: 'BluRay' },
  { key: 'scoutCfSourceWebdl', label: 'WEB-DL' },
];

const VIDEO_CODEC_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfCodecHevc', label: 'HEVC' },
  { key: 'scoutCfCodecAv1', label: 'AV1' },
  { key: 'scoutCfCodecH264', label: 'H264' },
];

const AUDIO_SCORE_FIELDS: OrderedScoreField[] = [
  { key: 'scoutCfAudioAtmos', label: 'Atmos' },
  { key: 'scoutCfAudioTruehd', label: 'TrueHD' },
  { key: 'scoutCfAudioDts', label: 'DTS' },
  { key: 'scoutCfAudioDdp', label: 'DD+ / EAC3' },
  { key: 'scoutCfAudioAc3', label: 'AC3' },
  { key: 'scoutCfAudioAac', label: 'AAC' },
];

function parseScore(value: string | undefined): number {
  const n = Number(value ?? '');
  return Number.isFinite(n) ? n : 0;
}

function rankByScore(order: string[], fields: OrderedScoreField[], form: Record<string, string>): string[] {
  const allowed = new Set(fields.map(f => f.key));
  const base = order.filter(k => allowed.has(k));
  return [...base].sort((a, b) => {
    const diff = parseScore(form[b]) - parseScore(form[a]);
    if (diff !== 0) return diff;
    return base.indexOf(a) - base.indexOf(b);
  });
}

function AccordionSection({
  title,
  defaultOpen = false,
  icon,
  variant = 'default',
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  icon?: ReactNode;
  variant?: 'default' | 'general' | 'scout';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerTone = variant === 'general'
    ? { border: 'rgba(56,189,248,0.35)', bg: 'rgba(56,189,248,0.08)', text: '#bae6fd', icon: '#38bdf8' }
    : variant === 'scout'
      ? { border: 'rgba(124,58,237,0.45)', bg: 'rgba(124,58,237,0.12)', text: '#ddd6fe', icon: '#a78bfa' }
      : { border: 'var(--c-border)', bg: 'transparent', text: '#d4cfff', icon: 'var(--c-muted)' };

  return (
    <section className="rounded-xl border overflow-hidden" style={{ background: 'var(--c-surface)', borderColor: headerTone.border }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 text-left flex items-center justify-between transition-colors hover:bg-white/5"
        style={{ background: headerTone.bg }}
      >
        <span className="font-semibold inline-flex items-center gap-2" style={{ color: headerTone.text }}>
          {icon ? <span style={{ color: headerTone.icon }}>{icon}</span> : null}
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? 'rotate-180' : 'rotate-0'}`}
          style={{ color: 'var(--c-muted)' }}
        />
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  );
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx++;
  }
  return `${n.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function extractRuleDescription(configText: string): string {
  try {
    const obj = JSON.parse(configText) as Record<string, unknown>;
    const val = obj.description ?? obj.reason ?? '';
    return typeof val === 'string' ? val : '';
  } catch {
    return '';
  }
}

function patchRuleDescription(configText: string, description: string): string {
  try {
    const obj = JSON.parse(configText) as Record<string, unknown>;
    obj.description = description;
    return JSON.stringify(obj, null, 2);
  } catch {
    return JSON.stringify({ description }, null, 2);
  }
}

// ── Field component ────────────────────────────────────────────────────

function Field({
  label, name, value, onChange, type = 'text', placeholder = '', disabled = false, hint = '', tooltip = '',
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean; hint?: string; tooltip?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
        <span className="whitespace-nowrap">{label}</span>
        {tooltip && <InfoHint label={`${label} info`} text={tooltip} />}
      </label>
      <input
        type={type} name={name} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none disabled:opacity-50"
        style={{
          background: 'var(--c-bg)',
          border: '1px solid var(--c-border)',
          color: 'var(--c-text)',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
      />
      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>{hint}</p>}
    </div>
  );
}

function SliderField({
  label, name, value, onChange, min, max, step = 1, tooltip = '',
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  tooltip?: string;
}) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : min;
  const shown = step < 1 ? numeric.toFixed(1) : String(Math.round(numeric));
  return (
    <div>
      <label className="text-sm font-medium mb-1 flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
        <span className="whitespace-nowrap">{label}</span>
        {tooltip && <InfoHint label={`${label} info`} text={tooltip} />}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          name={name}
          min={min}
          max={max}
          step={step}
          value={numeric}
          onChange={e => onChange(e.target.value)}
          className="w-full"
        />
        <span className="text-xs font-mono min-w-[4rem] text-right" style={{ color: 'var(--c-text)' }}>
          {shown} Mbps
        </span>
      </div>
    </div>
  );
}

function OrderedScoreRow({
  fields,
  form,
  onChange,
}: {
  fields: OrderedScoreField[];
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [order, setOrder] = useState<string[]>(fields.map(f => f.key));

  useEffect(() => {
    setOrder(fields.map(f => f.key));
  }, [fields]);

  function commitReorder() {
    setOrder(prev => rankByScore(prev, fields, form));
  }

  const fieldMap = new Map(fields.map(f => [f.key, f]));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {order.map((key, idx) => {
        const meta = fieldMap.get(key);
        if (!meta) return null;
        return (
          <div key={key} className="flex items-center gap-2">
            <label className="text-sm font-medium whitespace-nowrap min-w-[72px]" style={{ color: '#c4b5fd' }}>
              {meta.label}
            </label>
            <input
              type="number"
              value={form[key] ?? ''}
              onChange={e => onChange(key, e.target.value)}
              onBlur={commitReorder}
              className="w-16 px-2 py-1.5 rounded text-sm text-center focus:outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            {idx < order.length - 1 && (
              <span className="text-sm font-semibold px-1" style={{ color: 'var(--c-muted)' }}>{'>'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Masked API key field ────────────────────────────────────────────────
// Shows a masked display (****xxxx) when a key is set; click Edit to replace.

function MaskedKeyField({
  label, name, maskedValue, value, onChange, hint = '',
}: {
  label: string; name: string; maskedValue: string; value: string;
  onChange: (v: string) => void; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasKey = Boolean(maskedValue);

  // If user clears the input while editing, stay in edit mode
  function handleCancel() {
    onChange('');
    setEditing(false);
    setRevealed(false);
  }

  const inputStyle = {
    background: 'var(--c-bg)',
    border: '1px solid var(--c-border)',
    color: 'var(--c-text)',
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>{label}</label>

      {hasKey && !editing ? (
        /* ── Masked display mode ── */
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono"
            style={{ ...inputStyle, color: 'var(--c-muted)' }}
          >
            <span className="tracking-widest select-none">
              {revealed ? maskedValue : maskedValue.replace(/\*/g, '●')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            className="p-2 rounded-lg hover:opacity-80"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
            title={revealed ? 'Hide' : 'Show masked key'}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(true); setRevealed(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ border: '1px solid var(--c-border)', color: '#c4b5fd' }}
          >
            <Pencil size={12} /> Replace
          </button>
        </div>
      ) : (
        /* ── Edit / empty mode ── */
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={revealed ? 'text' : 'password'}
              name={name}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={hasKey ? 'Type new key to replace…' : 'Paste API key…'}
              autoFocus={editing}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none pr-9"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--c-accent)')}
              onBlur={e => (e.target.style.borderColor = 'var(--c-border)')}
            />
            <button
              type="button"
              onClick={() => setRevealed(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              style={{ color: 'var(--c-muted)' }}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {hasKey && (
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-lg hover:opacity-80"
              style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
              title="Cancel — keep existing key"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {hint && <p className="mt-1 text-xs" style={{ color: 'var(--c-muted)' }}>{hint}</p>}
    </div>
  );
}

// ── Main Settings page ─────────────────────────────────────────────────

export function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [clientProfile, setClientProfile] = useState('android_tv');
  const [saved, setSaved] = useState(false);
  const [showScanPrompt, setShowScanPrompt] = useState(false);
  const [scoutRulesDraft, setScoutRulesDraft] = useState<ScoutRuleDraft[]>([]);
  const [scoutRulesSaved, setScoutRulesSaved] = useState(false);
  const [scoutRulesError, setScoutRulesError] = useState('');
  const [refineObjective, setRefineObjective] = useState('');

  useEffect(() => {
    if (data?.settings) {
      setForm({
        jellyfinUrl: data.settings.jellyfinUrl ?? '',
        jellyfinPublicUrl: data.settings.jellyfinPublicUrl ?? '',
        jellyfinApiKey: '',           // always blank — user types a new key to replace
        jellyfinApiKeyMasked: data.settings.jellyfinApiKey ?? '',  // shows ****xxxx from server
        prowlarrUrl: data.settings.prowlarrUrl ?? '',
        prowlarrApiKey: '',
        prowlarrApiKeyMasked: data.settings.prowlarrApiKey ?? '',
        libraryPath: data.settings.libraryPath ?? '',
        llmProvider: 'openai',
        llmApiKey: '',
        llmApiKeyMasked: data.settings.llmApiKey ?? '',
        scoutMinCritic:    data.settings.scoutMinCritic    ?? '65',
        scoutMinCommunity: data.settings.scoutMinCommunity ?? '7.0',
        scoutMaxResolution: data.settings.scoutMaxResolution ?? '1080p',
        scoutSearchBatchSize: data.settings.scoutSearchBatchSize ?? '5',
        scoutAutoEnabled: data.settings.scoutAutoEnabled ?? 'false',
        scoutAutoIntervalMin: data.settings.scoutAutoIntervalMin ?? '60',
        scoutAutoCooldownMin: data.settings.scoutAutoCooldownMin ?? '240',
        scoutCfRes2160: data.settings.scoutCfRes2160 ?? '40',
        scoutCfRes1080: data.settings.scoutCfRes1080 ?? '25',
        scoutCfRes720: data.settings.scoutCfRes720 ?? '10',
        scoutCfSourceRemux: data.settings.scoutCfSourceRemux ?? '28',
        scoutCfSourceBluray: data.settings.scoutCfSourceBluray ?? '16',
        scoutCfSourceWebdl: data.settings.scoutCfSourceWebdl ?? '12',
        scoutCfCodecHevc: data.settings.scoutCfCodecHevc ?? '20',
        scoutCfCodecAv1: data.settings.scoutCfCodecAv1 ?? '16',
        scoutCfCodecH264: data.settings.scoutCfCodecH264 ?? '8',
        scoutCfLegacyPenalty: data.settings.scoutCfLegacyPenalty ?? '30',
        scoutCfSmall4kPenalty: data.settings.scoutCfSmall4kPenalty ?? '15',
        scoutCfSmall4kMinGiB: data.settings.scoutCfSmall4kMinGiB ?? '8',
        scoutCfBitrateMinMbps: data.settings.scoutCfBitrateMinMbps ?? '0',
        scoutCfBitrateMaxMbps: data.settings.scoutCfBitrateMaxMbps ?? '120',
        scoutCfSeedersDivisor: data.settings.scoutCfSeedersDivisor ?? '20',
        scoutCfSeedersBonusCap: data.settings.scoutCfSeedersBonusCap ?? '12',
        scoutCfUsenetBonus: data.settings.scoutCfUsenetBonus ?? '10',
        scoutCfTorrentBonus: data.settings.scoutCfTorrentBonus ?? '0',
        jfSyncIntervalMin: data.settings.jfSyncIntervalMin ?? '30',
        jfSyncBatchSize:   data.settings.jfSyncBatchSize   ?? '10',
      });
      const savedProfile = data.settings.clientProfile ?? 'android_tv';
      setClientProfile(savedProfile);
      try { localStorage.setItem('clientProfile', savedProfile); } catch { /* */ }
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, string>) => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(settings)) {
        // Skip the masked display-only fields — they're never saved back
        if (k.endsWith('Masked')) continue;
        if (v !== '') payload[k] = v;
      }
      payload.llmProvider = 'openai';
      return api.saveSettings(payload);
    },
    onSuccess: (_result, variables) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Prompt for scan if library path was newly set or changed
      const prevPath = data?.settings.libraryPath ?? '';
      const newPath = variables.libraryPath ?? '';
      if (newPath && newPath !== prevPath) setShowScanPrompt(true);
    },
  });
  const { data: autoStatusData, refetch: refetchAutoStatus } = useQuery({
    queryKey: ['scout-auto-status'],
    queryFn: api.scoutAutoStatus,
    refetchInterval: 10_000,
  });
  const { data: scoutRulesData, refetch: refetchScoutRules } = useQuery({
    queryKey: ['rules', 'scout'],
    queryFn: () => api.rules('scout'),
    staleTime: 60_000,
  });
  const { data: trashSyncDetailsData, refetch: refetchTrashSyncDetails } = useQuery({
    queryKey: ['scout-trash-sync-details'],
    queryFn: api.scoutTrashSyncDetails,
    staleTime: 60_000,
  });
  const scoutAutoRunMutation = useMutation({
    mutationFn: () => api.scoutAutoRun(),
    onSuccess: () => {
      refetchAutoStatus();
    },
  });
  const scoutSyncTrashMutation = useMutation({
    mutationFn: () => api.scoutSyncTrashScores(),
    onSuccess: (res) => {
      setForm(prev => ({ ...prev, ...res.applied }));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      refetchScoutRules();
      refetchTrashSyncDetails();
    },
  });
  const scoutRefineDraftMutation = useMutation({
    mutationFn: (objective: string) => api.scoutRulesRefineDraft({ objective }),
  });
  const saveScoutRulesMutation = useMutation({
    mutationFn: (rules: ScoutRuleDraft[]) => {
      const payload = rules.map(r => ({
        id: r.id,
        category: 'scout',
        name: r.name,
        enabled: r.enabled,
        priority: r.priority,
        config: JSON.parse(r.configText || '{}'),
      }));
      return api.saveRules(payload);
    },
    onSuccess: () => {
      setScoutRulesSaved(true);
      setScoutRulesError('');
      setTimeout(() => setScoutRulesSaved(false), 2500);
      refetchScoutRules();
    },
    onError: (err) => {
      setScoutRulesSaved(false);
      setScoutRulesError((err as Error).message);
    },
  });
  const syncDetails = scoutSyncTrashMutation.data?.details ?? trashSyncDetailsData;
  const syncedTrashSource = syncDetails?.meta.source ?? data?.settings?.scoutTrashSyncSource ?? '';
  const syncedTrashRevision = syncDetails?.meta.revision ?? data?.settings?.scoutTrashSyncRevision ?? '';
  const syncedTrashAt = syncDetails?.meta.syncedAt ?? data?.settings?.scoutTrashSyncedAt ?? '';
  const syncedTrashRules = syncDetails?.meta.rulesSynced != null
    ? String(syncDetails.meta.rulesSynced)
    : (data?.settings?.scoutTrashSyncedRules ?? '');
  const syncedTrashWarning = syncDetails?.meta.warning ?? scoutSyncTrashMutation.data?.meta.warning ?? '';
  const hasTrashSyncDetails = Boolean(
    syncedTrashSource
    || syncedTrashRevision
    || syncedTrashAt
    || syncedTrashRules
    || (syncDetails?.applied.rules.length ?? 0) > 0
    || Object.keys(syncDetails?.applied.settings ?? {}).length > 0
  );
  const appliedSettingsEntries = Object.entries(syncDetails?.applied.settings ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const appliedRules = syncDetails?.applied.rules ?? [];
  const upstreamSnapshot = syncDetails?.upstream ?? null;

  useEffect(() => {
    const rules = scoutRulesData?.rules?.scout ?? [];
    const mapped = rules.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled !== 0,
      priority: r.priority,
      configText: toPrettyJson(r.config),
    }));
    setScoutRulesDraft(mapped);
  }, [scoutRulesData]);

  const [jellyfinHealth, setJellyfinHealth] = useState<{ ok: boolean; libraries?: number; error?: string } | null>(null);
  const [checkingJellyfinHealth, setCheckingJellyfinHealth] = useState(false);
  const [prowlarrHealth, setProwlarrHealth] = useState<{ ok: boolean; indexers?: number; error?: string } | null>(null);
  const [checkingProwlarrHealth, setCheckingProwlarrHealth] = useState(false);

  async function checkJellyfinHealth() {
    setCheckingJellyfinHealth(true);
    setJellyfinHealth(null);
    try {
      // Pass current form values so unsaved changes are tested, not just DB values
      const result = await api.health({
        url: form.jellyfinUrl || undefined,
        apiKey: form.jellyfinApiKey || undefined,
      });
      setJellyfinHealth(result.jellyfin);
    } catch (err) {
      setJellyfinHealth({ ok: false, error: (err as Error).message });
    } finally {
      setCheckingJellyfinHealth(false);
    }
  }

  async function checkProwlarrHealth() {
    setCheckingProwlarrHealth(true);
    setProwlarrHealth(null);
    try {
      const result = await api.health({
        prowlarrUrl: form.prowlarrUrl || undefined,
        prowlarrApiKey: form.prowlarrApiKey || undefined,
      });
      setProwlarrHealth(result.prowlarr);
    } catch (err) {
      setProwlarrHealth({ ok: false, error: (err as Error).message });
    } finally {
      setCheckingProwlarrHealth(false);
    }
  }

  function set(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    saveMutation.mutate({ ...form, clientProfile });
    try { localStorage.setItem('clientProfile', clientProfile); } catch { /* */ }
  }

  function updateScoutRule(id: number, patch: Partial<ScoutRuleDraft>) {
    setScoutRulesDraft(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function applyRefinementSuggestions() {
    const draft = scoutRefineDraftMutation.data;
    if (!draft) return;
    if (Object.keys(draft.proposedSettings).length > 0) {
      setForm(prev => ({ ...prev, ...draft.proposedSettings }));
    }
    if (draft.suggestedRuleToggles.length > 0) {
      setScoutRulesDraft(prev => prev.map(r => {
        const t = draft.suggestedRuleToggles.find(x => x.id === r.id);
        return t ? { ...r, enabled: t.enabled } : r;
      }));
    }
  }

  function applyScoutPreset(preset: (typeof SCOUT_PRESET_SAMPLES)[number]) {
    setForm(prev => ({ ...prev, ...preset.settingsPatch }));
    setRefineObjective(preset.objective);
  }

  const activeProfile = CLIENT_PROFILES.find(p => p.id === clientProfile) ?? CLIENT_PROFILES[0];

  if (isLoading) return <div className="p-8" style={{ color: 'var(--c-muted)' }}>Loading settings…</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
        <Settings2 size={20} style={{ color: 'var(--c-accent)' }} />
        Settings
      </h1>

      <AccordionSection title="General" defaultOpen variant="general" icon={<Link2 size={15} />}>
        <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
            <img src="/icons/jellyfin.svg" alt="Jellyfin" className="w-4 h-4 brightness-0 invert" />
            Jellyfin Connection
          </h2>
          <Field label="Jellyfin URL" name="jellyfinUrl" value={form.jellyfinUrl ?? ''}
            onChange={v => set('jellyfinUrl', v)} placeholder="http://localhost:8096"
            hint={[
              'Server-side URL — used by Curatarr\'s backend, not your browser.',
              'Bare-metal / local dev: http://localhost:8096',
              'Docker (same compose stack): http://jellyfin:8096',
              'Docker Desktop on Mac: http://host.docker.internal:8096',
              'Also configurable via config/config.yaml (settings.jellyfinUrl).',
            ].join(' · ')} />
          <Field label="Jellyfin Public Web URL" name="jellyfinPublicUrl" value={form.jellyfinPublicUrl ?? ''}
            onChange={v => set('jellyfinPublicUrl', v)} placeholder="https://jellyfin.example.com"
            hint="Browser-facing Jellyfin URL used for Movie detail page links (Open in Jellyfin)." />
          <MaskedKeyField
            label="API Key"
            name="jellyfinApiKey"
            maskedValue={form.jellyfinApiKeyMasked ?? ''}
            value={form.jellyfinApiKey ?? ''}
            onChange={v => set('jellyfinApiKey', v)}
            hint="Jellyfin Dashboard → Administration → API Keys → Add Key. Also configurable via config/config.yaml (settings.jellyfinApiKey)." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auto-sync interval (min)" name="jfSyncIntervalMin" value={form.jfSyncIntervalMin ?? '30'} onChange={v => set('jfSyncIntervalMin', v)} placeholder="30" hint="Minutes between automatic JF syncs. 0 = disabled. Takes effect after server restart." />
            <Field label="Sync batch size" name="jfSyncBatchSize" value={form.jfSyncBatchSize ?? '10'} onChange={v => set('jfSyncBatchSize', v)} placeholder="10" hint="Items per Jellyfin API page during sync." />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={checkJellyfinHealth} disabled={checkingJellyfinHealth} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}>
              {checkingJellyfinHealth ? <Loader2 size={13} className="animate-spin" /> : null}
              Test Connection
            </button>
            {jellyfinHealth && (
              jellyfinHealth.ok
                ? <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle size={14} /> Connected — {jellyfinHealth.libraries} libraries</span>
                : <span className="flex items-center gap-1 text-sm text-red-400"><AlertCircle size={14} /> {jellyfinHealth.error}</span>
            )}
          </div>
        </section>

        <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
            <LibraryIcon size={16} style={{ color: 'var(--c-accent)' }} />
            Library
          </h2>
          <Field label="Library Path" name="libraryPath" value={form.libraryPath ?? ''} onChange={v => set('libraryPath', v)} placeholder="/media/Movies" hint="Path used by the Scan command — as seen by the Curatarr process. In Docker use the container path of the mounted volume (e.g. /media). Also configurable via config/config.yaml (settings.libraryPath)." />
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
            {CLIENT_PROFILES.map(p => (
              <label key={p.id} className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors" style={{ borderColor: clientProfile === p.id ? 'var(--c-accent)' : 'var(--c-border)', background: clientProfile === p.id ? 'rgba(124,58,237,0.1)' : 'var(--c-bg)' }}>
                <input type="radio" name="clientProfile" value={p.id} checked={clientProfile === p.id} onChange={() => setClientProfile(p.id)} className="mt-0.5 accent-violet-600" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{p.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>{p.hint}</div>
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
      </AccordionSection>

      <AccordionSection title="Scout" defaultOpen variant="scout" icon={<Bot size={15} />}>
        <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold" style={{ color: '#d4cfff' }}>Prowlarr</h2>
          <Field label="Prowlarr URL" name="prowlarrUrl" value={form.prowlarrUrl ?? ''} onChange={v => set('prowlarrUrl', v)} placeholder="http://localhost:9696" hint="Used by Scout release search and auto-scout. Also configurable via config/config.yaml (settings.prowlarrUrl)." />
          <MaskedKeyField
            label="API Key"
            name="prowlarrApiKey"
            maskedValue={form.prowlarrApiKeyMasked ?? ''}
            value={form.prowlarrApiKey ?? ''}
            onChange={v => set('prowlarrApiKey', v)}
            hint="Prowlarr Settings → General → Security → API Key. Also configurable via config/config.yaml (settings.prowlarrApiKey)." />
          <div className="flex items-center gap-3">
            <button onClick={checkProwlarrHealth} disabled={checkingProwlarrHealth} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm" style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: '#c4b5fd' }}>
              {checkingProwlarrHealth ? <Loader2 size={13} className="animate-spin" /> : null}
              Test Connection
            </button>
            {prowlarrHealth && (
              prowlarrHealth.ok
                ? <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle size={14} /> Connected — {prowlarrHealth.indexers} indexers</span>
                : <span className="flex items-center gap-1 text-sm text-red-400"><AlertCircle size={14} /> {prowlarrHealth.error}</span>
            )}
          </div>
        </section>

        <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
          <h2 className="font-semibold" style={{ color: '#d4cfff' }}>LLM Provider (Optional)</h2>
          <div className="space-y-1">
            <label className="text-sm font-medium" style={{ color: '#c4b5fd' }}>Provider</label>
            <input
              value="openai"
              disabled
              className="w-full px-3 py-2 rounded-lg text-sm opacity-85 cursor-not-allowed"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Optional: used to filter Scout results more intelligently, break near-score ties, and bias recommendations toward your selected playback client preferences.
            </p>
          </div>
          <MaskedKeyField
            label="API Key"
            name="llmApiKey"
            maskedValue={form.llmApiKeyMasked ?? ''}
            value={form.llmApiKey ?? ''}
            onChange={v => set('llmApiKey', v)}
            hint="OpenAI API key. Configure in config/secrets.yaml (llm.apiKey) or save in Settings." />
        </section>

        <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          CF Scoring, Rules, Scout
          <InfoHint label="CF scoring info" text={SCOUT_CF_SCORING_TOOLTIP} />
        </h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Tune Scout release ranking without code changes. Higher score means a release is recommended first.
        </p>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Source of truth: <code>config/scoring.yaml</code>. Saving Settings also syncs this file.
        </p>
        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
              Resolution
            </div>
            <OrderedScoreRow
              fields={RESOLUTION_SCORE_FIELDS}
              form={form}
              onChange={set}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
              Source
            </div>
            <OrderedScoreRow
              fields={SOURCE_SCORE_FIELDS}
              form={form}
              onChange={set}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
              Video
            </div>
            <OrderedScoreRow
              fields={VIDEO_CODEC_SCORE_FIELDS}
              form={form}
              onChange={set}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Legacy Penalty" name="scoutCfLegacyPenalty"
                value={form.scoutCfLegacyPenalty ?? '30'}
                onChange={v => set('scoutCfLegacyPenalty', v)}
                tooltip={LEGACY_PENALTY_TOOLTIP} />
              <Field label="Small 4K Penalty" name="scoutCfSmall4kPenalty"
                value={form.scoutCfSmall4kPenalty ?? '15'}
                onChange={v => set('scoutCfSmall4kPenalty', v)} />
              <Field label="Small 4K Min GiB" name="scoutCfSmall4kMinGiB"
                value={form.scoutCfSmall4kMinGiB ?? '8'}
                onChange={v => set('scoutCfSmall4kMinGiB', v)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SliderField
                label="Bitrate Min"
                name="scoutCfBitrateMinMbps"
                value={form.scoutCfBitrateMinMbps ?? '0'}
                onChange={v => set('scoutCfBitrateMinMbps', v)}
                min={0}
                max={80}
                step={0.5}
                tooltip={BITRATE_GATE_TOOLTIP}
              />
              <SliderField
                label="Bitrate Max"
                name="scoutCfBitrateMaxMbps"
                value={form.scoutCfBitrateMaxMbps ?? '120'}
                onChange={v => set('scoutCfBitrateMaxMbps', v)}
                min={1}
                max={200}
                step={1}
                tooltip={BITRATE_GATE_TOOLTIP}
              />
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
              Audio
            </div>
            <OrderedScoreRow
              fields={AUDIO_SCORE_FIELDS}
              form={form}
              onChange={set}
            />
          </div>

          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
              Protocol & Availability
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="Usenet Bonus" name="scoutCfUsenetBonus"
                value={form.scoutCfUsenetBonus ?? '10'}
                onChange={v => set('scoutCfUsenetBonus', v)} />
              <Field label="Torrent Bonus" name="scoutCfTorrentBonus"
                value={form.scoutCfTorrentBonus ?? '0'}
                onChange={v => set('scoutCfTorrentBonus', v)} />
              <Field label="Seeder Divisor" name="scoutCfSeedersDivisor"
                value={form.scoutCfSeedersDivisor ?? '20'}
                onChange={v => set('scoutCfSeedersDivisor', v)}
                tooltip={SEEDER_DIVISOR_TOOLTIP} />
              <Field label="Seeder Max Bonus" name="scoutCfSeedersBonusCap"
                value={form.scoutCfSeedersBonusCap ?? '12'}
                onChange={v => set('scoutCfSeedersBonusCap', v)}
                tooltip={SEEDER_MAX_BONUS_TOOLTIP} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => scoutSyncTrashMutation.mutate()}
            disabled={scoutSyncTrashMutation.isPending}
            className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
            style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            title="Apply Curatarr TRaSH-aligned baseline scoring and refresh Scout rules"
          >
            {scoutSyncTrashMutation.isPending ? 'Syncing…' : 'Sync TRaSH Scores'}
          </button>
          <a
            href="https://trash-guides.info/"
            target="_blank"
            rel="noreferrer"
            className="text-xs underline"
            style={{ color: '#c4b5fd' }}
            title="Official TRaSH-Guides"
          >
            Official TRaSH-Guides
          </a>
          {scoutSyncTrashMutation.isError && (
            <span className="text-xs text-red-400">
              {(scoutSyncTrashMutation.error as Error).message}
            </span>
          )}
        </div>
        <div className="rounded-lg border p-3 space-y-3 text-xs" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <div className="font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            TRaSH Sync Details (Read-only)
          </div>
          {!hasTrashSyncDetails && (
            <div style={{ color: 'var(--c-muted)' }}>No TRaSH sync recorded yet.</div>
          )}
          {hasTrashSyncDetails && (
            <>
              <div className="rounded border p-2 space-y-1" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
                <div className="font-semibold" style={{ color: '#d4cfff' }}>Sync Meta</div>
                <div style={{ color: 'var(--c-muted)' }}>
                  Source: <span style={{ color: 'var(--c-text)' }}>{syncedTrashSource || 'n/a'}</span>
                </div>
                <div style={{ color: 'var(--c-muted)' }}>
                  Revision: <span style={{ color: 'var(--c-text)' }}>{syncedTrashRevision || 'n/a'}</span>
                </div>
                <div style={{ color: 'var(--c-muted)' }}>
                  Last synced: <span style={{ color: 'var(--c-text)' }}>
                    {syncedTrashAt ? new Date(syncedTrashAt).toLocaleString() : 'n/a'}
                  </span>
                </div>
                <div style={{ color: 'var(--c-muted)' }}>
                  Rules synced: <span style={{ color: 'var(--c-text)' }}>{syncedTrashRules || 'n/a'}</span>
                </div>
                {syncedTrashWarning && (
                  <div style={{ color: '#f59e0b' }}>Note: {syncedTrashWarning}</div>
                )}
              </div>

              <div className="rounded border p-2 space-y-2" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
                <div className="font-semibold" style={{ color: '#d4cfff' }}>Imported Into Curatarr</div>
                <div className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                  Exact settings and scout rules applied by the most recent TRaSH sync.
                </div>
                {appliedSettingsEntries.length === 0 && appliedRules.length === 0 && (
                  <div style={{ color: 'var(--c-muted)' }}>No applied snapshot available yet.</div>
                )}
                {appliedSettingsEntries.length > 0 && (
                  <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                    <table className="w-full text-[11px]">
                      <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                        <tr>
                          <th className="px-2 py-1 text-left">Setting</th>
                          <th className="px-2 py-1 text-left">Value</th>
                          <th className="px-2 py-1 text-left">JSON</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appliedSettingsEntries.map(([key, value]) => (
                          <tr key={key} style={{ borderTop: '1px solid var(--c-border)' }}>
                            <td className="px-2 py-1 font-mono" style={{ color: '#c4b5fd' }}>{key}</td>
                            <td className="px-2 py-1" style={{ color: 'var(--c-text)' }}>{value}</td>
                            <td className="px-2 py-1">
                              <details>
                                <summary className="cursor-pointer" style={{ color: '#c4b5fd' }}>View JSON</summary>
                                <pre className="mt-1 p-2 rounded overflow-auto" style={{ background: 'var(--c-bg)', color: '#d4cfff' }}>
{toPrettyJson({ [key]: value })}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {appliedRules.length > 0 && (
                  <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                    <table className="w-full text-[11px]">
                      <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                        <tr>
                          <th className="px-2 py-1 text-left">Rule</th>
                          <th className="px-2 py-1 text-right">Priority</th>
                          <th className="px-2 py-1 text-center">Enabled</th>
                          <th className="px-2 py-1 text-left">JSON</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appliedRules.map((rule) => (
                          <tr key={rule.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                            <td className="px-2 py-1" style={{ color: 'var(--c-text)' }}>{rule.name}</td>
                            <td className="px-2 py-1 text-right" style={{ color: '#c4b5fd' }}>{rule.priority}</td>
                            <td className="px-2 py-1 text-center" style={{ color: rule.enabled ? '#4ade80' : '#f87171' }}>
                              {rule.enabled ? 'Yes' : 'No'}
                            </td>
                            <td className="px-2 py-1">
                              <details>
                                <summary className="cursor-pointer" style={{ color: '#c4b5fd' }}>View JSON</summary>
                                <pre className="mt-1 p-2 rounded overflow-auto" style={{ background: 'var(--c-bg)', color: '#d4cfff' }}>
{toPrettyJson(rule.config)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded border p-2 space-y-2" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}>
                <div className="font-semibold" style={{ color: '#d4cfff' }}>Upstream TRaSH Snapshot</div>
                {!upstreamSnapshot && (
                  <div style={{ color: 'var(--c-muted)' }}>
                    Upstream snapshot unavailable. Curatarr-applied snapshot is still recorded.
                  </div>
                )}
                {upstreamSnapshot && (
                  <>
                    <div style={{ color: 'var(--c-muted)' }}>
                      Path: <span className="font-mono" style={{ color: 'var(--c-text)' }}>{upstreamSnapshot.path}</span>
                      {' '}· Files: <span style={{ color: 'var(--c-text)' }}>{upstreamSnapshot.fileCount}</span>
                      {upstreamSnapshot.truncated && <span style={{ color: '#f59e0b' }}> · showing first {upstreamSnapshot.files.length}</span>}
                    </div>
                    <div className="overflow-auto rounded border" style={{ borderColor: 'var(--c-border)' }}>
                      <table className="w-full text-[11px]">
                        <thead style={{ background: 'var(--c-bg)', color: 'var(--c-muted)' }}>
                          <tr>
                            <th className="px-2 py-1 text-left">File</th>
                            <th className="px-2 py-1 text-right">Size</th>
                            <th className="px-2 py-1 text-left">Status</th>
                            <th className="px-2 py-1 text-left">JSON</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upstreamSnapshot.files.map((f) => (
                            <tr key={f.name} style={{ borderTop: '1px solid var(--c-border)' }}>
                              <td className="px-2 py-1">
                                <a href={f.downloadUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: '#c4b5fd' }}>
                                  {f.name}
                                </a>
                              </td>
                              <td className="px-2 py-1 text-right" style={{ color: 'var(--c-text)' }}>{fmtBytes(f.size)}</td>
                              <td className="px-2 py-1" style={{ color: f.warning ? '#f59e0b' : '#4ade80' }}>
                                {f.warning ? `warning: ${f.warning}` : 'parsed'}
                              </td>
                              <td className="px-2 py-1">
                                {f.parsedJson ? (
                                  <details>
                                    <summary className="cursor-pointer" style={{ color: '#c4b5fd' }}>View JSON</summary>
                                    <pre className="mt-1 p-2 rounded overflow-auto" style={{ background: 'var(--c-bg)', color: '#d4cfff' }}>
{toPrettyJson(f.parsedJson)}
                                    </pre>
                                  </details>
                                ) : (
                                  <span style={{ color: 'var(--c-muted)' }}>n/a</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Scout Rules
          </div>
          {scoutRulesDraft.length === 0 && (
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>No Scout rules found.</div>
          )}
          <div className="space-y-3">
            {scoutRulesDraft.map((rule) => (
              <div key={rule.id} className="rounded border p-3 space-y-2" style={{ borderColor: 'var(--c-border)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                    {rule.name}
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-muted)' }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={e => updateScoutRule(rule.id, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>Priority</label>
                  <input
                    type="number"
                    value={String(rule.priority)}
                    onChange={e => updateScoutRule(rule.id, { priority: Number(e.target.value || 0) })}
                    className="w-32 px-2 py-1 rounded text-xs focus:outline-none"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>Rule Intent (Natural Text)</label>
                  <input
                    type="text"
                    value={extractRuleDescription(rule.configText)}
                    onChange={e => updateScoutRule(rule.id, { configText: patchRuleDescription(rule.configText, e.target.value) })}
                    className="w-full px-2 py-1 rounded text-xs focus:outline-none"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                    placeholder="Example: prefer WEB-DL over WEBRip at same resolution"
                  />
                </div>
                <details>
                  <summary className="cursor-pointer text-xs" style={{ color: 'var(--c-muted)' }}>Advanced JSON</summary>
                  <textarea
                    rows={5}
                    value={rule.configText}
                    onChange={e => updateScoutRule(rule.id, { configText: e.target.value })}
                    className="w-full mt-2 px-2 py-1 rounded text-xs font-mono focus:outline-none"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  />
                </details>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#8b87aa' }}>Rule Name</label>
                  <input
                    type="text"
                    value={rule.name}
                    onChange={e => updateScoutRule(rule.id, { name: e.target.value })}
                    className="w-full px-2 py-1 rounded text-xs focus:outline-none"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => saveScoutRulesMutation.mutate(scoutRulesDraft)}
              disabled={saveScoutRulesMutation.isPending || scoutRulesDraft.length === 0}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              {saveScoutRulesMutation.isPending ? 'Saving Rules…' : 'Save Scout Rules'}
            </button>
            {scoutRulesSaved && <span className="text-xs text-green-400">Saved</span>}
            {scoutRulesError && <span className="text-xs text-red-400">{scoutRulesError}</span>}
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b87aa' }}>
            Rule Refinement Assistant
          </div>
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
            This action is currently local heuristic logic and prompt generation. No direct LLM API call is executed here.
          </p>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>Opinionated Samples</div>
            <div className="flex flex-wrap gap-2">
              {SCOUT_PRESET_SAMPLES.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyScoutPreset(preset)}
                  className="px-2 py-1 rounded border text-xs"
                  style={{ borderColor: 'var(--c-border)', color: '#c4b5fd', background: 'rgba(124,58,237,0.08)' }}
                  title={preset.summary}
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: '#8b87aa' }}>Natural Objective Samples</div>
            <div className="flex flex-wrap gap-2">
              {SCOUT_OBJECTIVE_SAMPLES.map(sample => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setRefineObjective(sample)}
                  className="px-2 py-1 rounded border text-xs"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={2}
            value={refineObjective}
            onChange={e => setRefineObjective(e.target.value)}
            placeholder="Example: favor compatibility on Android TV while keeping 4K quality high."
            className="w-full px-3 py-2 rounded text-sm focus:outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scoutRefineDraftMutation.mutate(refineObjective)}
              disabled={scoutRefineDraftMutation.isPending}
              className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
            >
              {scoutRefineDraftMutation.isPending ? 'Generating…' : 'Generate Draft (Heuristic)'}
            </button>
            {scoutRefineDraftMutation.data && (
              <button
                type="button"
                onClick={applyRefinementSuggestions}
                className="px-3 py-1.5 rounded border text-xs"
                style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
              >
                Apply Suggestions
              </button>
            )}
            {scoutRefineDraftMutation.data?.mode && (
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                Mode: {scoutRefineDraftMutation.data.mode}
              </span>
            )}
          </div>
          {scoutRefineDraftMutation.data && (
            <textarea
              rows={8}
              readOnly
              value={scoutRefineDraftMutation.data.prompt}
              className="w-full px-3 py-2 rounded text-xs font-mono"
              style={{ background: 'rgba(30,30,46,0.7)', border: '1px solid var(--c-border)', color: '#d4cfff' }}
            />
          )}
        </div>
      </section>

      {/* Scout Defaults */}
      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: '#d4cfff' }}>
          Scout Defaults
          <InfoHint label="Scout defaults info" text={CODEC_SCORING_TOOLTIP} />
        </h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          These defaults pre-fill the Scout Queue filters. Override per-session in Scout Queue.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min MC (Metacritic)" name="scoutMinCritic"
            value={form.scoutMinCritic ?? '65'}
            onChange={v => set('scoutMinCritic', v)}
            placeholder="65" />
          <Field label="Min IMDb" name="scoutMinCommunity"
            value={form.scoutMinCommunity ?? '7.0'}
            onChange={v => set('scoutMinCommunity', v)}
            placeholder="7.0" />
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>Max Resolution</label>
            <select
              value={form.scoutMaxResolution ?? '1080p'}
              onChange={e => set('scoutMaxResolution', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
            >
              <option value="2160p">2160p</option>
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <Field label="Scout Batch Size" name="scoutSearchBatchSize"
            value={form.scoutSearchBatchSize ?? '5'}
            onChange={v => set('scoutSearchBatchSize', v)}
            placeholder="5"
            hint="Hard-capped to 10 server-side to protect indexers." />
        </div>

        {/* AV1 scoring note */}
        <div className="flex items-start gap-2 p-3 rounded-lg text-xs"
          style={{ background: 'rgba(139,135,170,0.08)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>
            AV1 files score highest (100) for compression efficiency.
            Scout Queue and Library will show a compatibility warning for AV1 files
            when your selected client lacks hardware AV1 decode.
            Active profile: <em style={{ color: 'var(--c-text)' }}>{activeProfile.label}</em> —
            Video codec AV1: <span style={{ color: 'var(--c-text)' }}>{activeProfile.videoCodec.av1}</span>.
          </span>
        </div>
      </section>

      <section className="space-y-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--c-border)' }}>
        <h2 className="font-semibold" style={{ color: '#d4cfff' }}>Scout Automation</h2>
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
          Automatic Scout runs process at most your Scout Batch Size (hard max 10) per run.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#c4b5fd' }}>Enabled</label>
            <select
              value={form.scoutAutoEnabled ?? 'false'}
              onChange={e => set('scoutAutoEnabled', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-accent)' }}
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </div>
          <Field label="Interval (min)" name="scoutAutoIntervalMin"
            value={form.scoutAutoIntervalMin ?? '60'}
            onChange={v => set('scoutAutoIntervalMin', v)}
            placeholder="60"
            hint="Minimum enforced at 5 min." />
          <Field label="Cooldown (min)" name="scoutAutoCooldownMin"
            value={form.scoutAutoCooldownMin ?? '240'}
            onChange={v => set('scoutAutoCooldownMin', v)}
            placeholder="240"
            hint="Skip titles recently auto-scouted." />
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--c-muted)' }}>
          <span>
            Auto status: {autoStatusData?.running ? 'running' : 'idle'}
            {autoStatusData?.lastRun ? ` · last run ${autoStatusData.lastRun.finishedAt}` : ''}
          </span>
          <button
            type="button"
            onClick={() => scoutAutoRunMutation.mutate()}
            disabled={scoutAutoRunMutation.isPending}
            className="px-3 py-1.5 rounded border text-xs disabled:opacity-60"
            style={{ borderColor: 'var(--c-border)', color: '#c4b5fd' }}
          >
            {scoutAutoRunMutation.isPending ? 'Running…' : 'Run Auto Scout Now'}
          </button>
        </div>
      </section>
      </AccordionSection>

      {/* Scan prompt — shown after library path is saved */}
      {showScanPrompt && (
        <div className="flex items-start gap-3 p-4 rounded-xl border"
          style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}>
          <ScanLine size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--c-accent)' }} />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
              Library path updated — start a scan?
            </div>
            <div className="text-xs" style={{ color: 'var(--c-muted)' }}>
              An initial scan reads every file with ffprobe to extract resolution, codec, HDR, audio, and size metadata.
              It runs in batches and may take a few minutes depending on library size.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowScanPrompt(false); navigate('/scan'); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--c-accent)' }}>
                <ScanLine size={12} /> Go to Scan
              </button>
              <button
                onClick={() => setShowScanPrompt(false)}
                className="text-xs underline" style={{ color: 'var(--c-muted)' }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saveMutation.isPending}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--c-accent)' }}>
          {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-green-400">
            <CheckCircle size={14} /> Saved
          </span>
        )}
        {saveMutation.isError && (
          <span className="text-sm text-red-400">Save failed</span>
        )}
      </div>
    </div>
  );
}
