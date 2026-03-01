import { useState } from 'react';
import { AlertTriangle, ShieldAlert, TriangleAlert, Info } from 'lucide-react';

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
    explanation: 'The video stream contains presentation timestamps (PTS) that decrease instead of increasing. This means the encoder or muxer produced an invalid bitstream with out-of-order frame timing.',
    impact: 'Playback freezes, stutter, or black frames at the affected point. Hardware decoders on Android TV or Apple TV may lock up.',
    action: 'Re-encode from a clean source. If the source is a Blu-ray disc, the disc itself may have non-standard timestamps that a good encoder should handle.',
  },
  large_gop: {
    title: 'Large GOP — long keyframe interval',
    explanation: 'The gap between I-frames (keyframes) is larger than typical recommendations (≤ 4 s for streaming). Blu-ray encodes commonly use 5–10 s GOP, which is generally fine.',
    impact: 'Slow chapter seek (player must decode from the last keyframe), slow adaptive bitrate switching. Values > 10 s may cause visible lag when jumping to a chapter.',
    action: 'Usually acceptable for local library playback. If seek lag is noticeable, re-encode with a smaller GOP (e.g., -g 120 for 24 fps = 5 s).',
  },
  decode_error: {
    title: 'Decode errors',
    explanation: 'ffmpeg encountered errors while fully decoding the file. This may indicate a corrupt bitstream, truncated data, or a broken encode.',
    impact: 'Possible visual artefacts, incomplete playback, or a hard stop at the corrupted region.',
    action: 'Verify the file with a full deep check. Replace the file if errors persist.',
  },
  mux_error: {
    title: 'Mux-level error',
    explanation: 'The container has structural problems (bad header, invalid chunk layout, or missing index). The video content itself may be fine, but the wrapper is damaged.',
    impact: 'Seeking may fail, duration may be reported incorrectly, or some players may refuse to open the file.',
    action: 'Remux into a fresh MKV using mkvmerge or ffmpeg -c copy to rebuild the container without re-encoding.',
  },
};

const DOCS_INTRO = `Quality analytics are generated during the "Deep Verify" pass (Verify page → Start Deep Verify). Each file is fully decoded by ffmpeg to detect bitstream issues beyond what a simple metadata probe can reveal.

Severities:
  FLAG  — confirmed playback issue (freezes, artefacts, corrupt decode)
  WARN  — potential quality concern (large GOP, non-standard timestamps)

Run Deep Verify after your initial Library Scan to populate this column.`;


interface QualityBadgeProps {
  resolution?: string | null;
  codec?: string | null;
}

// Client profiles that lack AV1 hardware decode
const AV1_UNSUPPORTED_PROFILES = new Set(['android_tv', 'fire_tv']);

const resColors: Record<string, string> = {
  '2160p': 'bg-purple-600/30 text-purple-300 border-purple-700',
  '1080p': 'bg-blue-600/30 text-blue-300 border-blue-700',
  '720p':  'bg-green-600/30 text-green-300 border-green-700',
  '480p':  'bg-yellow-600/30 text-yellow-300 border-yellow-700',
  'other': 'bg-[#26263a]/60 text-[#8b87aa] border-[#26263a]',
};

const codecColors: Record<string, string> = {
  'hevc':        'bg-teal-600/30 text-teal-300 border-teal-700',
  'h264':        'bg-sky-600/30 text-sky-300 border-sky-700',
  'av1':         'bg-emerald-600/30 text-emerald-300 border-emerald-700',
  'mpeg4':       'bg-orange-600/30 text-orange-300 border-orange-700',
  'mpeg2video':  'bg-red-600/30 text-red-300 border-red-700',
};

/** Read the active client profile from localStorage (set by Settings page) */
function getClientProfile(): string {
  try { return localStorage.getItem('clientProfile') ?? 'android_tv'; }
  catch { return 'android_tv'; }
}

export function ResolutionBadge({ resolution }: { resolution?: string | null }) {
  if (!resolution) return null;
  const cls = resColors[resolution] ?? resColors['other'];
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${cls}`}>
      {resolution}
    </span>
  );
}

export function CodecBadge({ codec, showCompatWarning = false }: {
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
      <span className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${cls}`}>
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
      title="Legacy codec — consider replacing with H264 or HEVC"
      className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono rounded border bg-orange-600/30 text-orange-300 border-orange-700 gap-1"
    >
      <AlertTriangle size={10} />
      {codec}
    </span>
  );
}

export function HdrBadge({ hdrFormats, dvProfile }: {
  hdrFormats?: string;
  dvProfile?: number | null;
}) {
  let formats: string[] = [];
  try { formats = hdrFormats ? (JSON.parse(hdrFormats) as string[]) : []; } catch { /* */ }
  if (formats.length === 0) return null;

  return (
    <span className="inline-flex gap-1">
      {formats.map(f => {
        const isDv = f === 'DolbyVision';
        const label = isDv && dvProfile ? `DV${dvProfile}` : f.replace('DolbyVision', 'DV');
        // P7 = FEL — only SHIELD decodes natively; add subtle indicator
        const isP7 = isDv && dvProfile === 7;
        return (
          <span
            key={f}
            title={isP7 ? 'DV Profile 7 (FEL) — requires NVIDIA SHIELD or FEL-capable player' : undefined}
            className={`inline-block px-1.5 py-0.5 text-xs font-mono rounded border ${
              isP7
                ? 'bg-pink-600/30 text-pink-300 border-pink-700'
                : 'bg-amber-600/30 text-amber-300 border-amber-700'
            }`}
          >
            {label}
          </span>
        );
      })}
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

  let flags: QualityFlag[] = [];
  try { flags = qualityFlagsJson ? (JSON.parse(qualityFlagsJson) as QualityFlag[]) : []; } catch { /* */ }

  // Not yet verified
  if (!verifyStatus) {
    return (
      <span className="text-xs" style={{ color: 'var(--c-border)' }} title="Not yet verified — run Deep Verify to check">—</span>
    );
  }

  const hasFlag = flags.some(f => f.severity === 'FLAG');
  const hasWarn = flags.some(f => f.severity === 'WARN');

  // No flags detected
  if (flags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}
        title="Deep verify passed — no quality flags">
        OK
      </span>
    );
  }

  const overallColor = hasFlag
    ? { bg: 'rgba(248,113,113,0.15)', text: '#f87171', icon: <ShieldAlert size={11} /> }
    : { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', icon: <TriangleAlert size={11} /> };

  const label = hasFlag ? 'FLAG' : 'WARN';

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold"
        style={{ background: overallColor.bg, color: overallColor.text }}
        title={`${flags.length} issue(s) detected — click to expand`}
      >
        {overallColor.icon}
        {label}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 rounded-xl shadow-2xl text-xs"
          style={{
            background: '#1e1e2e',
            border: '1px solid var(--c-border)',
            width: '340px',
            top: '110%',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: 'var(--c-border)' }}>
            <span className="font-semibold" style={{ color: 'var(--c-text)' }}>
              Quality Issues
            </span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setShowDocs(v => !v)}
                title="Show column documentation"
                style={{ color: showDocs ? 'var(--c-accent)' : 'var(--c-muted)' }}>
                <Info size={13} />
              </button>
              <button type="button" onClick={() => setOpen(false)}
                style={{ color: 'var(--c-muted)' }}>✕</button>
            </span>
          </div>

          {/* Flag list */}
          <div className="px-3 py-2 space-y-2">
            {flags.map((f, i) => {
              const isFlag = f.severity === 'FLAG';
              const color = isFlag ? '#f87171' : '#fbbf24';
              const doc = FLAG_DOCS[f.code];
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    <span className="font-semibold shrink-0 mt-0.5"
                      style={{ color }}>
                      {f.severity}
                    </span>
                    <span style={{ color: 'var(--c-text)' }}>{f.message}</span>
                  </div>
                  {doc && (
                    <div className="ml-10 space-y-0.5" style={{ color: 'var(--c-muted)' }}>
                      <div><span className="font-medium" style={{ color: '#a5b4fc' }}>Impact:</span> {doc.impact}</div>
                      <div><span className="font-medium" style={{ color: '#a5b4fc' }}>Action:</span> {doc.action}</div>
                    </div>
                  )}
                  {f.detail && !doc && (
                    <div className="ml-10" style={{ color: 'var(--c-muted)' }}>{f.detail}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Docs section */}
          {showDocs && (
            <div className="border-t px-3 py-2" style={{ borderColor: 'var(--c-border)' }}>
              <p className="font-semibold mb-1.5" style={{ color: '#a5b4fc' }}>About Quality Analytics</p>
              <pre className="whitespace-pre-wrap leading-relaxed"
                style={{ color: 'var(--c-muted)', fontFamily: 'inherit', fontSize: '0.7rem' }}>
                {DOCS_INTRO}
              </pre>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
