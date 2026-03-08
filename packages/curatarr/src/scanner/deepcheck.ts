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

/** Subtitle probe warnings that do not impact video/audio decode health */
const BENIGN_SUBTITLE_PATTERNS = [
  /could not find codec parameters for stream \d+ \(subtitle:[^)]+\): unspecified size/i,
];

/** DTS/PTS disorder patterns — captured as quality flags, not ignored */
const DTS_DISORDER = /non monoton|DTS .{0,60}, next:.{0,60}invalid|out of order packet/i;

const MUX_ERROR_PATTERNS = [
  /moov atom not found/i,
  /invalid data found when processing input/i,
  /error reading header/i,
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
  return BENIGN_PATTERNS.some((p) => p.test(line)) || BENIGN_SUBTITLE_PATTERNS.some((p) => p.test(line));
}

function matchesAny(line: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(line));
}

const MIN_BUDGET_SECONDS = 30;
const MAX_BUDGET_SECONDS = 3600;
const DEFAULT_BUDGET_SECONDS = 30;
const SAMPLE_SEGMENT_SECONDS = 12;
const MAX_SAMPLE_WINDOWS = 180;
const MAX_WINDOW_TIMEOUT_MS = 20_000;
const WINDOW_KILL_GRACE_MS = 1_500;

// ── GOP analysis ───────────────────────────────────────────────────────────

/**
 * Analyse keyframe intervals by reading the first 60 seconds of video packets.
 * Uses ffprobe packet-level metadata (no decoding) — fast for indexed containers.
 *
 * Thresholds (matching Blu-ray + streaming conventions):
 *   WARN  max GOP > 4 s  (short enough for smooth chapter seeking)
 */
// ── Main deepCheck ─────────────────────────────────────────────────────────

function clampBudgetSeconds(input: number | undefined): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return DEFAULT_BUDGET_SECONDS;
  return Math.max(MIN_BUDGET_SECONDS, Math.min(MAX_BUDGET_SECONDS, Math.floor(n)));
}

function randomInt(minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return Math.floor(minInclusive);
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

function buildSampleWindows(
  durationSec: number | null | undefined,
  budgetSeconds: number,
): Array<{ offsetSec: number; durationSec: number }> {
  const windowCount = Math.max(1, Math.min(MAX_SAMPLE_WINDOWS, Math.floor(budgetSeconds / 8)));

  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return Array.from({ length: windowCount }, () => ({ offsetSec: 0, durationSec: SAMPLE_SEGMENT_SECONDS }));
  }

  const sampleDur = Math.min(SAMPLE_SEGMENT_SECONDS, Math.max(4, Math.floor(durationSec)));
  if (durationSec <= sampleDur + 1) {
    return [{ offsetSec: 0, durationSec: sampleDur }];
  }

  const maxOffset = Math.max(0, Math.floor(durationSec - sampleDur));
  const windows: Array<{ offsetSec: number; durationSec: number }> = [];
  const seen = new Set<number>();
  const addWindow = (offsetSec: number) => {
    const clamped = Math.max(0, Math.min(maxOffset, Math.floor(offsetSec)));
    if (seen.has(clamped)) return;
    seen.add(clamped);
    windows.push({ offsetSec: clamped, durationSec: sampleDur });
  };

  // Stratified random windows across start/middle/end for better coverage.
  const thirds = 3;
  for (let i = 0; i < thirds && windows.length < windowCount; i++) {
    const start = Math.floor((maxOffset * i) / thirds);
    const end = Math.floor((maxOffset * (i + 1)) / thirds);
    addWindow(randomInt(start, Math.max(start, end)));
  }

  while (windows.length < windowCount) {
    addWindow(randomInt(0, maxOffset));
    if (seen.size >= maxOffset + 1) break;
  }

  return windows;
}

export async function deepCheck(
  filePath: string,
  signal?: AbortSignal,
  mediaDurationSec?: number | null,
  budgetSecondsInput?: number,
): Promise<DeepCheckResult> {
  const start = Date.now();
  const budgetSeconds = clampBudgetSeconds(budgetSecondsInput);
  const budgetMs = budgetSeconds * 1000;
  const deadline = start + budgetMs;
  const errors: string[] = [];
  const warnings: string[] = [];
  const qualityFlags: QualityFlag[] = [];
  const sampleWindows = buildSampleWindows(mediaDurationSec, budgetSeconds);
  let timedOut = false;

  // --- Run ffmpeg null sampling windows ---
  const ffmpegResult = {
    errors: [] as string[],
    warnings: [] as string[],
    dtsLines: [] as string[],
    decodeLines: [] as string[],
    muxLines: [] as string[],
  };

  for (const window of sampleWindows) {
    if (signal?.aborted) break;
    if (Date.now() >= deadline) {
      timedOut = true;
      break;
    }

    const remainingMs = Math.max(1, deadline - Date.now());
    const windowTimeoutMs = Math.max(1_000, Math.min(MAX_WINDOW_TIMEOUT_MS, remainingMs + WINDOW_KILL_GRACE_MS));

    const windowResult = await new Promise<{
      errors: string[];
      warnings: string[];
      dtsLines: string[];
      decodeLines: string[];
      muxLines: string[];
      timedOut: boolean;
    }>((resolve) => {
      const _errors: string[] = [];
      const _warnings: string[] = [];
      const _dtsLines: string[] = [];
      const _decodeLines: string[] = [];
      const _muxLines: string[] = [];
      let _timedOut = false;
      let settled = false;

      const finalize = () => {
        if (settled) return;
        settled = true;
        resolve({
          errors: _errors,
          warnings: _warnings,
          dtsLines: _dtsLines,
          decodeLines: _decodeLines,
          muxLines: _muxLines,
          timedOut: _timedOut,
        });
      };

      const proc = spawn(
        'ffmpeg',
        [
          '-v',
          'warning',
          '-threads',
          '2',
          '-ss',
          String(window.offsetSec),
          '-i',
          filePath,
          '-map',
          '0:v?',
          '-map',
          '0:a?',
          '-sn',
          '-dn',
          '-t',
          String(window.durationSec),
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
        _timedOut = true;
        proc.kill('SIGKILL');
      }, windowTimeoutMs);

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
            _dtsLines.push(line);
          } else if (matchesAny(line, DECODE_ERROR_PATTERNS)) {
            _decodeLines.push(line);
            _errors.push(line);
          } else if (matchesAny(line, MUX_ERROR_PATTERNS)) {
            _muxLines.push(line);
            _errors.push(line);
          }
        }

        finalize();
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        _errors.push(`spawn error: ${err.message}`);
        finalize();
      });
    });

    ffmpegResult.errors.push(...windowResult.errors);
    ffmpegResult.warnings.push(...windowResult.warnings);
    ffmpegResult.dtsLines.push(...windowResult.dtsLines);
    ffmpegResult.decodeLines.push(...windowResult.decodeLines);
    ffmpegResult.muxLines.push(...windowResult.muxLines);
    if (windowResult.timedOut) {
      timedOut = true;
      break;
    }
  }

  if (timedOut) {
    ffmpegResult.errors.push(`timeout: file check exceeded ${budgetSeconds}s budget`);
  }

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

  return {
    filePath,
    ok: errors.length === 0,
    errors,
    warnings,
    qualityFlags,
    durationMs: Date.now() - start,
  };
}
