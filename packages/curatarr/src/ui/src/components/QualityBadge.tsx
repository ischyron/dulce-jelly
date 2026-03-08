import { AlertTriangle, Info, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getCodecDescription } from './shared/utils';

// ── QualityFlag types (mirrors src/scanner/deepcheck.ts) ──────────────────

export interface QualityFlag {
  severity: 'FLAG' | 'WARN';
  code: 'backward_pts' | 'large_gop' | 'mux_error' | 'decode_error';
  message: string;
  detail?: string;
}

// ── Flag code documentation (inline help) ─────────────────────────────────

const FLAG_DOCS: Record<string, { title: string; explanation: string; impact: string; action: string }> = {
  backward_pts: {
    title: 'Backward PTS jumps — timestamp disorder',
    explanation:
      'The video stream contains presentation timestamps (PTS) that decrease instead of increasing. This means the encoder or muxer produced an invalid bitstream with out-of-order frame timing.',
    impact:
      'Playback freezes, stutter, or black frames at the affected point. Hardware decoders on Android TV or Apple TV may lock up.',
    action:
      'Re-encode from a clean source. If the source is a Blu-ray disc, the disc itself may have non-standard timestamps that a good encoder should handle.',
  },
  large_gop: {
    title: 'Large GOP — long keyframe interval',
    explanation:
      'The gap between I-frames (keyframes) is larger than typical recommendations (≤ 4 s for streaming). Blu-ray encodes commonly use 5–10 s GOP, which is generally fine.',
    impact:
      'Slow chapter seek (player must decode from the last keyframe), slow adaptive bitrate switching. Values > 10 s may cause visible lag when jumping to a chapter.',
    action:
      'Usually acceptable for local library playback. If seek lag is noticeable, re-encode with a smaller GOP (e.g., -g 120 for 24 fps = 5 s).',
  },
  decode_error: {
    title: 'Decode errors',
    explanation:
      'ffmpeg encountered actionable decode/bitstream faults (for example: "Invalid NAL unit size", "error while decoding", "corrupt/truncated stream").',
    impact: 'Possible visual artefacts, incomplete playback, or a hard stop at the corrupted region.',
    action: 'Re-run Deep Check with a higher time budget. Replace the file if errors persist.',
  },
  mux_error: {
    title: 'Mux-level error',
    explanation:
      'The container has structural problems (for example: "moov atom not found", invalid atom/header, or invalid container data).',
    impact: 'Seeking may fail, duration may be reported incorrectly, or some players may refuse to open the file.',
    action: 'Remux into a fresh MKV using mkvmerge or ffmpeg -c copy to rebuild the container without re-encoding.',
  },
};

const DOCS_INTRO = `Quality analytics are generated during "Deep Check via Random Sampling" (Verify page). Curatarr samples random file segments within your per-file time budget to catch obvious decode/container faults.

Severities:
  FLAG  — confirmed playback issue (freezes, artefacts, corrupt decode)
  WARN  — potential quality concern (large GOP, non-standard timestamps)

Run Deep Check after your initial Library Scan to populate this column.`;

interface QualityBadgeProps {
  resolution?: string | null;
  codec?: string | null;
}

const audioBadgeColors: Record<string, string> = {
  atmos: 'bg-fuchsia-600/30 text-fuchsia-300 border-fuchsia-700',
  truehd: 'bg-violet-600/30 text-violet-300 border-violet-700',
  'dts-ma': 'bg-cyan-600/30 text-cyan-300 border-cyan-700',
  dts: 'bg-sky-600/30 text-sky-300 border-sky-700',
  ddp: 'bg-emerald-600/30 text-emerald-300 border-emerald-700',
  ac3: 'bg-orange-600/30 text-orange-300 border-orange-700',
  aac: 'bg-lime-600/30 text-lime-300 border-lime-700',
};

const sourceBadgeColors: Record<string, string> = {
  Remux: 'bg-amber-600/20 text-amber-300 border-amber-700',
  BluRay: 'bg-blue-600/20 text-blue-300 border-blue-700',
  'WEB-DL': 'bg-indigo-600/20 text-indigo-300 border-indigo-700',
};

// Maps release title tags (from releaseTitleTags) to audioBadgeColors keys
const audioTagToKey: Record<string, string> = {
  Atmos: 'atmos',
  TrueHD: 'truehd',
  'DTS-MA': 'dts-ma',
  DTS: 'dts',
  DDP: 'ddp',
  AC3: 'ac3',
  AAC: 'aac',
};

const audioTagLabels: Record<string, string> = {
  Atmos: 'Atmos',
  TrueHD: 'TrueHD',
  'DTS-MA': 'DTS-MA',
  DTS: 'DTS',
  DDP: 'DDP',
  AC3: 'AC3',
  AAC: 'AAC',
};

function codecFromTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (/\bx265\b|\bh\.?265\b|\bhevc\b/.test(t)) return 'hevc';
  if (/\bx264\b|\bh\.?264\b|\bavc\b/.test(t)) return 'h264';
  if (/\bav1\b/.test(t)) return 'av1';
  return null;
}

/**
 * Renders quality badges for a Prowlarr/indexer release title.
 * Uses the same badge components and colors as the library table.
 * Pass the tags output from releaseTitleTags() + the raw title for codec detection.
 */
export function ReleaseTagBadges({ tags, title }: { tags: string[]; title: string }) {
  const codec = codecFromTitle(title);
  const resolutionTags = tags.filter((t) => ['2160p', '1080p', '720p', '480p'].includes(t));
  const sourceTags = tags.filter((t) => sourceBadgeColors[t]);
  const audioTags = tags.filter((t) => audioTagToKey[t]);
  const hasBadges = resolutionTags.length > 0 || codec || sourceTags.length > 0 || audioTags.length > 0;
  if (!hasBadges) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {resolutionTags.map((tag) => (
        <ResolutionBadge key={tag} resolution={tag} />
      ))}
      {codec && <CodecBadge codec={codec} />}
      {sourceTags.map((tag) => (
        <span
          key={tag}
          className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${sourceBadgeColors[tag]}`}
        >
          {tag}
        </span>
      ))}
      {audioTags.map((tag) => {
        const key = audioTagToKey[tag];
        return (
          <span
            key={tag}
            className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${audioBadgeColors[key] ?? audioBadgeColors.aac}`}
          >
            {audioTagLabels[tag] ?? tag}
          </span>
        );
      })}
    </div>
  );
}

// Client profiles that lack AV1 hardware decode
const AV1_UNSUPPORTED_PROFILES = new Set(['android_tv', 'fire_tv']);

const resColors: Record<string, string> = {
  '2160p': 'bg-purple-600/30 text-purple-300 border-purple-700',
  '1080p': 'bg-blue-600/30 text-blue-300 border-blue-700',
  '720p': 'bg-cyan-600/30 text-cyan-300 border-cyan-700',
  '480p': 'bg-yellow-600/30 text-yellow-300 border-yellow-700',
  other: 'bg-[#26263a]/60 text-[#8b87aa] border-[#26263a]',
};

const codecColors: Record<string, string> = {
  hevc: 'bg-teal-600/30 text-teal-300 border-teal-700',
  h264: 'bg-sky-600/30 text-sky-300 border-sky-700',
  av1: 'bg-emerald-600/30 text-emerald-300 border-emerald-700',
  mpeg4: 'bg-orange-600/30 text-orange-300 border-orange-700',
  mpeg2video: 'bg-red-600/30 text-red-300 border-red-700',
};

/** Read the active client profile from localStorage (set by Settings page) */
function getClientProfile(): string {
  try {
    return localStorage.getItem('clientProfile') ?? 'android_tv';
  } catch {
    return 'android_tv';
  }
}

export function ResolutionBadge({ resolution }: { resolution?: string | null }) {
  if (!resolution) return null;
  const cls = resColors[resolution] ?? resColors.other;
  return <span className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${cls}`}>{resolution}</span>;
}

export function CodecBadge({
  codec,
  showCompatWarning = false,
}: {
  codec?: string | null;
  showCompatWarning?: boolean;
}) {
  if (!codec) return null;
  const key = codec.toLowerCase();
  const cls = codecColors[key] ?? 'bg-[#26263a]/60 text-[#8b87aa] border-[#26263a]';

  const isAv1 = key === 'av1';
  const profile = getClientProfile();
  const av1Warn = isAv1 && showCompatWarning && AV1_UNSUPPORTED_PROFILES.has(profile);

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${cls}`}
        title={getCodecDescription(key) ?? codec}
      >
        {codec}
      </span>
      {av1Warn && (
        <span
          title={`AV1 may not hardware-decode on ${profile.replace('_', ' ')}. Check client support.`}
          className="inline-flex items-center"
        >
          <AlertTriangle size={11} className="text-amber-400" />
        </span>
      )}
    </span>
  );
}

/** Legacy codec warning (mpeg4, mpeg2) */
export function LegacyCodecBadge({ codec }: { codec?: string | null }) {
  if (!codec) return null;
  const key = codec.toLowerCase();
  const isLegacy = key === 'mpeg4' || key === 'mpeg2video' || key === 'msmpeg4v3';
  if (!isLegacy) return null;
  return (
    <span
      title={getCodecDescription('legacy') ?? 'Legacy codec — consider replacing with H264 or HEVC'}
      className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono rounded border bg-orange-600/30 text-orange-300 border-orange-700 gap-1"
    >
      <AlertTriangle size={10} />
      {codec}
    </span>
  );
}

export function HdrBadge({
  hdrFormats,
  dvProfile,
}: {
  hdrFormats?: string;
  dvProfile?: number | null;
}) {
  let formats: string[] = [];
  try {
    formats = hdrFormats ? (JSON.parse(hdrFormats) as string[]) : [];
  } catch {
    /* */
  }
  if (formats.length === 0) return null;

  return (
    <span className="inline-flex gap-1">
      {formats.map((f) => {
        const isDv = f === 'DolbyVision';
        const label = isDv && dvProfile ? `DV${dvProfile}` : f.replace('DolbyVision', 'DV');
        // P7 = FEL — only SHIELD decodes natively; add subtle indicator
        const isP7 = isDv && dvProfile === 7;
        return (
          <span
            key={f}
            title={isP7 ? 'DV Profile 7 (FEL) — requires NVIDIA SHIELD or FEL-capable player' : undefined}
            className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${
              isP7 ? 'bg-pink-600/30 text-pink-300 border-pink-700' : 'bg-amber-600/30 text-amber-300 border-amber-700'
            }`}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Displays a Jellyfin critic score (0–100) with a fresh/rotten indicator.
 * Convention follows Rotten Tomatoes: ≥60 = Fresh, <60 = Rotten.
 */
export function CriticScoreBadge({
  score,
  showTomatoIcon = false,
}: {
  score: number | null | undefined;
  showTomatoIcon?: boolean;
}) {
  if (score == null) return <span style={{ color: 'var(--c-border)' }}>—</span>;
  const fresh = score >= 60;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono"
      title={
        fresh
          ? `${score} — Fresh (≥60). Jellyfin critic score (0–100).`
          : `${score} — Rotten (<60). Jellyfin critic score (0–100).`
      }
    >
      {showTomatoIcon && (
        <img
          src="/icons/rottentomatoes.svg"
          alt={fresh ? 'Fresh' : 'Rotten'}
          className="w-3 h-3"
          style={{ opacity: fresh ? 1 : 0.45, filter: fresh ? undefined : 'grayscale(1)' }}
        />
      )}
      <span style={{ color: fresh ? '#4ade80' : '#f87171' }}>{score}</span>
    </span>
  );
}

export function AudioQualityBadges({
  audioCodec,
  audioProfile,
}: {
  audioCodec?: string | null;
  audioProfile?: string | null;
}) {
  const codec = (audioCodec ?? '').toLowerCase().trim();
  const profile = (audioProfile ?? '').toLowerCase().trim();
  const chips: string[] = [];
  const add = (chip: string) => {
    if (!chips.includes(chip)) chips.push(chip);
  };

  if (profile.includes('atmos')) add('atmos');

  if (codec === 'truehd' || profile.includes('truehd')) add('truehd');

  // Keep DTS-MA and DTS distinct; do not emit DTS when MA is present.
  const hasDtsMa =
    profile.includes('dts-hd ma') || profile.includes('dts hd ma') || profile.includes('dts-ma') || profile === 'ma';
  const hasDts = codec.startsWith('dts') || profile.includes('dts');
  if (hasDtsMa) add('dts-ma');
  else if (hasDts) add('dts');

  if (
    codec === 'eac3' ||
    profile.includes('dolby digital plus') ||
    profile.includes('ddp') ||
    profile.includes('dd+')
  ) {
    add('ddp');
  }
  if (codec === 'ac3' || profile === 'dolby digital') add('ac3');
  if (codec === 'aac') add('aac');

  if (chips.length === 0) return null;

  const labels: Record<string, string> = {
    atmos: 'Atmos',
    truehd: 'TrueHD',
    'dts-ma': 'DTS-MA',
    dts: 'DTS',
    ddp: 'DDP',
    ac3: 'AC3',
    aac: 'AAC',
  };

  return (
    <span className="inline-flex gap-1 flex-wrap">
      {chips.map((chip) => (
        <span
          key={chip}
          className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${audioBadgeColors[chip] ?? audioBadgeColors.aac}`}
        >
          {labels[chip] ?? chip.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function QualityBadge({ resolution, codec }: QualityBadgeProps) {
  return (
    <span className="inline-flex gap-1">
      <ResolutionBadge resolution={resolution} />
      <CodecBadge codec={codec} showCompatWarning />
    </span>
  );
}

// ── QualityFlagsBadge ──────────────────────────────────────────────────────

/**
 * Shows a compact severity badge for the Issues column.
 * Click to toggle a popover with flag detail + documentation.
 *
 * @param qualityFlagsJson  JSON string from files.quality_flags (may be null/'[]')
 * @param verifyStatus      Current verify_status: null means not yet verified
 */
export function QualityFlagsBadge({
  qualityFlagsJson,
  verifyStatus,
}: {
  qualityFlagsJson?: string | null;
  verifyStatus?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close popup on scroll so it doesn't drift from the button
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', close, { capture: true });
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const POPUP_W = 340;
      const top = rect.bottom + 4;
      let left = rect.right - POPUP_W;
      if (left < 8) left = 8;
      if (left + POPUP_W > window.innerWidth - 8) left = window.innerWidth - POPUP_W - 8;
      setPopupStyle({ position: 'fixed', top, left, width: `${POPUP_W}px`, zIndex: 9999 });
    }
    setOpen(true);
  }

  let flags: QualityFlag[] = [];
  try {
    flags = qualityFlagsJson ? (JSON.parse(qualityFlagsJson) as QualityFlag[]) : [];
  } catch {
    /* */
  }

  // Not yet verified
  if (!verifyStatus) {
    return (
      <span
        className="text-xs"
        style={{ color: 'var(--c-border)' }}
        title="Not yet verified — run Deep Check to analyze"
      >
        —
      </span>
    );
  }

  const hasFlag = flags.some((f) => f.severity === 'FLAG');
  const hasWarn = flags.some((f) => f.severity === 'WARN');

  // No flags detected
  if (flags.length === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}
        title="Deep check passed — no quality flags"
      >
        OK
      </span>
    );
  }

  const overallColor = hasFlag
    ? { bg: 'rgba(248,113,113,0.15)', text: '#f87171', icon: <ShieldAlert size={11} /> }
    : { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', icon: <TriangleAlert size={11} /> };

  const label = hasFlag ? 'FLAG' : 'WARN';

  return (
    <span className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold"
        style={{ background: overallColor.bg, color: overallColor.text }}
        title={`${flags.length} issue(s) detected — click to expand`}
      >
        {overallColor.icon}
        {label}
      </button>

      {open && (
        <div
          className="rounded-xl shadow-2xl text-xs"
          style={{
            ...popupStyle,
            background: '#1e1e2e',
            border: '1px solid var(--c-border)',
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--c-border)' }}
          >
            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
              Quality Issues
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDocs((v) => !v)}
                title="Show column documentation"
                style={{ color: showDocs ? 'var(--c-accent)' : 'var(--c-muted)' }}
              >
                <Info size={13} />
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ color: 'var(--c-muted)' }}>
                ✕
              </button>
            </span>
          </div>

          {/* Flag list */}
          <div className="px-3 py-2 space-y-2">
            {flags.map((f) => {
              const isFlag = f.severity === 'FLAG';
              const color = isFlag ? '#f87171' : '#fbbf24';
              const doc = FLAG_DOCS[f.code];
              return (
                <div key={`${f.code}:${f.message}`} className="space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    <span className="font-semibold shrink-0 mt-0.5" style={{ color }}>
                      {f.severity}
                    </span>
                    <span style={{ color: 'var(--c-text)' }}>{f.message}</span>
                  </div>
                  {doc && (
                    <div className="ml-10 space-y-0.5" style={{ color: 'var(--c-muted)' }}>
                      <div>
                        <span className="font-medium" style={{ color: '#a5b4fc' }}>
                          Impact:
                        </span>{' '}
                        {doc.impact}
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#a5b4fc' }}>
                          Action:
                        </span>{' '}
                        {doc.action}
                      </div>
                    </div>
                  )}
                  {f.detail && !doc && (
                    <div className="ml-10" style={{ color: 'var(--c-muted)' }}>
                      {f.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Docs section */}
          {showDocs && (
            <div className="border-t px-3 py-2" style={{ borderColor: 'var(--c-border)' }}>
              <p className="font-semibold mb-1.5" style={{ color: '#a5b4fc' }}>
                About Quality Analytics
              </p>
              <pre
                className="whitespace-pre-wrap leading-relaxed"
                style={{ color: 'var(--c-muted)', fontFamily: 'inherit', fontSize: '0.7rem' }}
              >
                {DOCS_INTRO}
              </pre>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
