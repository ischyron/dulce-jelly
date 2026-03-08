/**
 * Deep-verify a video file using ffmpeg null output.
 * Runs: ffmpeg -v warning -threads 2 -i <file> -map 0:v? -map 0:a? -sn -dn -f null - 2>&1
 * Parses stderr with strict high-signal classification:
 *   - Ignore known benign diagnostics/noise.
 *   - Keep actionable decode/container faults only.
 *   - Track DTS monotonic warnings separately as timestamp quality flags.
 *
 * Also runs a lightweight quality analysis:
 *   - Backward PTS/DTS jumps → FLAG (timestamp disorder, may cause playback freezes)
 *   - Large GOP (keyframe interval) → WARN (slow seeking, chapter skip lag)
 */

import { spawn } from 'node:child_process';

// ── Quality flag types ─────────────────────────────────────────────────────

export interface QualityFlag {
  /** FLAG = playback impact (freezes, corruption); WARN = quality concern */
  severity: 'FLAG' | 'WARN';
  /** Machine-readable code for display logic */
  code: 'backward_pts' | 'large_gop' | 'mux_error' | 'decode_error';
  /** Human-readable summary line */
  message: string;
  /** Optional extra context (cause, recommendation) */
  detail?: string;
}

export interface DeepCheckResult {
  filePath: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  qualityFlags: QualityFlag[];
  durationMs: number;
}

// ── Patterns ───────────────────────────────────────────────────────────────

/** Truly benign lines that can be ignored without logging */
const BENIGN_PATTERNS = [
  /pts has no value/i,
  /application provided invalid/i,
  /automatic encoder selection failed.*format null/i,
  /default encoder for format null .*disabled/i,
  /\bAt least one output file must be specified\b/i,
];

/** DTS/PTS disorder patterns — captured as quality flags, not ignored */
const DTS_DISORDER = /non monoton|DTS .{0,60}, next:.{0,60}invalid|out of order packet/i;

const MUX_ERROR_PATTERNS = [
  /moov atom not found/i,
  /invalid data found when processing input/i,
  /error reading header/i,
  /could not find codec parameters/i,
  /invalid atom size/i,
];

const DECODE_ERROR_PATTERNS = [
  /invalid nal unit size/i,
  /non-existing pps/i,
  /pps id out of range/i,
  /sps id out of range/i,
  /error while decoding/i,
  /decode_slice_header error/i,
  /cabac decode of qscale diff failed/i,
  /missing reference picture/i,
  /reference picture missing/i,
  /corrupt/i,
  /truncated/i,
  /packet too small/i,
  /invalid .* bitstream/i,
];

/** Extract the jump magnitude from lines like "DTS -0.125, next:-1.125" */
function parseDtsMagnitude(line: string): number | null {
  const m = line.match(/DTS\s+([-\d.]+),\s*next:([-\d.]+)/i);
  if (!m) return null;
  const cur = Number.parseFloat(m[1]);
  const nxt = Number.parseFloat(m[2]);
  return Number.isNaN(cur) || Number.isNaN(nxt) ? null : Math.abs(nxt - cur);
}

function isBenign(line: string): boolean {
  return BENIGN_PATTERNS.some((p) => p.test(line));
}

function matchesAny(line: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(line));
}

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per file

// ── GOP analysis ───────────────────────────────────────────────────────────

/**
 * Analyse keyframe intervals by reading the first 60 seconds of video packets.
 * Uses ffprobe packet-level metadata (no decoding) — fast for indexed containers.
 *
 * Thresholds (matching Blu-ray + streaming conventions):
 *   WARN  max GOP > 4 s  (short enough for smooth chapter seeking)
 */
async function analyzeGop(filePath: string): Promise<QualityFlag[]> {
  return new Promise<QualityFlag[]>((resolve) => {
    const flags: QualityFlag[] = [];

    const proc = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-select_streams',
        'v:0',
        '-show_packets',
        '-show_entries',
        'packet=flags,pts_time',
        '-of',
        'csv=p=0',
        '-t',
        '60', // first 60 seconds only
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    let stdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve([]); // timeout — skip GOP analysis
    }, 30_000);

    proc.on('close', () => {
      clearTimeout(timer);

      // Parse lines: "K__,0.000000" or "___,0.041667"
      const keyframeTimes: number[] = [];
      for (const line of stdout.split('\n')) {
        const parts = line.trim().split(',');
        if (parts.length < 2) continue;
        const packetFlags = parts[0];
        const ptsTime = Number.parseFloat(parts[1]);
        if (packetFlags.startsWith('K') && !Number.isNaN(ptsTime)) {
          keyframeTimes.push(ptsTime);
        }
      }

      if (keyframeTimes.length < 2) {
        resolve(flags);
        return;
      }

      // Compute keyframe intervals
      const gaps: number[] = [];
      for (let i = 1; i < keyframeTimes.length; i++) {
        const gap = keyframeTimes[i] - keyframeTimes[i - 1];
        if (gap > 0) gaps.push(gap);
      }

      if (gaps.length === 0) {
        resolve(flags);
        return;
      }

      const maxGap = Math.max(...gaps);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

      if (maxGap > 4) {
        flags.push({
          severity: 'WARN',
          code: 'large_gop',
          message: `large GOP (max ${maxGap.toFixed(1)}s, avg ${avgGap.toFixed(1)}s)`,
          detail:
            'Long keyframe intervals slow chapter seeking and bitrate adaptation. Normal: ≤ 2–4 s for streaming; Blu-ray encodes may reach 10 s.',
        });
      }

      resolve(flags);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]); // ffprobe unavailable — skip
    });
  });
}

// ── Main deepCheck ─────────────────────────────────────────────────────────

export async function deepCheck(filePath: string, signal?: AbortSignal): Promise<DeepCheckResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const qualityFlags: QualityFlag[] = [];

  // --- Run ffmpeg null pass ---
  const ffmpegResult = await new Promise<{
    errors: string[];
    warnings: string[];
    dtsLines: string[];
    decodeLines: string[];
    muxLines: string[];
  }>((resolve) => {
    const _errors: string[] = [];
    const _warnings: string[] = [];
    const _dtsLines: string[] = [];
    const _decodeLines: string[] = [];
    const _muxLines: string[] = [];

    const proc = spawn(
      'ffmpeg',
      [
        '-v',
        'warning',
        '-threads',
        '2',
        '-i',
        filePath,
        '-map',
        '0:v?',
        '-map',
        '0:a?',
        '-sn',
        '-dn',
        '-f',
        'null',
        '-',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      _errors.push('timeout: file check exceeded 5 minutes');
    }, TIMEOUT_MS);

    const onAbort = () => {
      proc.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    proc.on('close', () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);

      for (const line of stderr
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)) {
        if (isBenign(line)) continue;

        if (DTS_DISORDER.test(line)) {
          // Captured as quality flag below — does not force a hard fail alone.
          _dtsLines.push(line);
        } else if (matchesAny(line, DECODE_ERROR_PATTERNS)) {
          _decodeLines.push(line);
          _errors.push(line);
        } else if (matchesAny(line, MUX_ERROR_PATTERNS)) {
          _muxLines.push(line);
          _errors.push(line);
        } else if (/\bwarning\b/i.test(line) || /\berror\b/i.test(line) || /\bfailed\b/i.test(line)) {
          // Keep unclassified diagnostics as warnings to avoid false-positive hard failures.
          _warnings.push(line);
        }
      }

      resolve({
        errors: _errors,
        warnings: _warnings,
        dtsLines: _dtsLines,
        decodeLines: _decodeLines,
        muxLines: _muxLines,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      _errors.push(`spawn error: ${err.message}`);
      resolve({
        errors: _errors,
        warnings: _warnings,
        dtsLines: _dtsLines,
        decodeLines: _decodeLines,
        muxLines: _muxLines,
      });
    });
  });

  errors.push(...ffmpegResult.errors);
  warnings.push(...ffmpegResult.warnings);

  // --- Backward PTS/DTS quality flag ---
  const dtsLines = ffmpegResult.dtsLines;
  if (dtsLines.length > 0) {
    // Try to extract the dominant jump magnitude
    const magnitudes = dtsLines.map(parseDtsMagnitude).filter((v): v is number => v !== null);
    const unique = [...new Set(magnitudes.map((v) => v.toFixed(3)))];
    const repeated = magnitudes.length > 1 && unique.length === 1;
    const magStr = magnitudes.length > 0 ? ` (${magnitudes[0].toFixed(3)}s${repeated ? ' repeated' : ''})` : '';

    qualityFlags.push({
      severity: 'FLAG',
      code: 'backward_pts',
      message: `backward PTS jumps${magStr} → timestamp disorder`,
      detail: `${dtsLines.length} occurrence(s) detected. Timestamp disorder causes decoders to produce out-of-order frames, which manifests as freezes or stuttering during playback. The file may be a flawed encode or a Blu-ray disc with non-standard timestamps.`,
    });
  }

  if (ffmpegResult.decodeLines.length > 0) {
    qualityFlags.push({
      severity: 'FLAG',
      code: 'decode_error',
      message: `${ffmpegResult.decodeLines.length} actionable bitstream/decode error(s)`,
      detail: ffmpegResult.decodeLines.slice(0, 3).join(' | '),
    });
  }

  if (ffmpegResult.muxLines.length > 0) {
    qualityFlags.push({
      severity: 'FLAG',
      code: 'mux_error',
      message: `${ffmpegResult.muxLines.length} actionable container/mux error(s)`,
      detail: ffmpegResult.muxLines.slice(0, 3).join(' | '),
    });
  }

  // --- GOP analysis (skipped if aborted) ---
  if (!signal?.aborted) {
    const gopFlags = await analyzeGop(filePath);
    qualityFlags.push(...gopFlags);
  }

  return {
    filePath,
    ok: errors.length === 0,
    errors,
    warnings,
    qualityFlags,
    durationMs: Date.now() - start,
  };
}
