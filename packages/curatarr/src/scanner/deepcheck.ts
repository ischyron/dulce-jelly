/**
 * Deep-verify a video file using ffmpeg null output.
 * Runs: ffmpeg -v error -threads 2 -i <file> -map 0 -f null - 2>&1
 * Parses stderr for error/warning lines; benign "pts has no value" lines are ignored.
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
];

/** DTS/PTS disorder patterns — captured as quality flags, not ignored */
const DTS_DISORDER = /non monoton|DTS .{0,60}, next:.{0,60}invalid|out of order packet/i;

/** Extract the jump magnitude from lines like "DTS -0.125, next:-1.125" */
function parseDtsMagnitude(line: string): number | null {
  const m = line.match(/DTS\s+([-\d.]+),\s*next:([-\d.]+)/i);
  if (!m) return null;
  const cur = parseFloat(m[1]);
  const nxt = parseFloat(m[2]);
  return isNaN(cur) || isNaN(nxt) ? null : Math.abs(nxt - cur);
}

function isBenign(line: string): boolean {
  return BENIGN_PATTERNS.some(p => p.test(line));
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

    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_packets',
      '-show_entries', 'packet=flags,pts_time',
      '-of', 'csv=p=0',
      '-t', '60',      // first 60 seconds only
      filePath,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let stdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve([]);  // timeout — skip GOP analysis
    }, 30_000);

    proc.on('close', () => {
      clearTimeout(timer);

      // Parse lines: "K__,0.000000" or "___,0.041667"
      const keyframeTimes: number[] = [];
      for (const line of stdout.split('\n')) {
        const parts = line.trim().split(',');
        if (parts.length < 2) continue;
        const packetFlags = parts[0];
        const ptsTime = parseFloat(parts[1]);
        if (packetFlags.startsWith('K') && !isNaN(ptsTime)) {
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
          detail: 'Long keyframe intervals slow chapter seeking and bitrate adaptation. Normal: ≤ 2–4 s for streaming; Blu-ray encodes may reach 10 s.',
        });
      }

      resolve(flags);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve([]);  // ffprobe unavailable — skip
    });
  });
}

// ── Main deepCheck ─────────────────────────────────────────────────────────

export async function deepCheck(
  filePath: string,
  signal?: AbortSignal
): Promise<DeepCheckResult> {
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const qualityFlags: QualityFlag[] = [];

  // --- Run ffmpeg null pass ---
  const ffmpegResult = await new Promise<{ errors: string[]; warnings: string[]; dtsLines: string[] }>((resolve) => {
    const _errors: string[] = [];
    const _warnings: string[] = [];
    const _dtsLines: string[] = [];

    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-threads', '2',
      '-i', filePath,
      '-map', '0',
      '-f', 'null',
      '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      _errors.push('timeout: file check exceeded 5 minutes');
    }, TIMEOUT_MS);

    const onAbort = () => { proc.kill('SIGKILL'); };
    signal?.addEventListener('abort', onAbort, { once: true });

    proc.on('close', () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);

      for (const line of stderr.split('\n').map(l => l.trim()).filter(Boolean)) {
        if (isBenign(line)) continue;

        if (DTS_DISORDER.test(line)) {
          // Captured as quality flag below — do NOT add to errors
          _dtsLines.push(line);
        } else if (/\berror\b/i.test(line)) {
          _errors.push(line);
        } else if (/\bwarning\b/i.test(line)) {
          _warnings.push(line);
        } else {
          _errors.push(line);
        }
      }

      resolve({ errors: _errors, warnings: _warnings, dtsLines: _dtsLines });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      _errors.push(`spawn error: ${err.message}`);
      resolve({ errors: _errors, warnings: _warnings, dtsLines: _dtsLines });
    });
  });

  errors.push(...ffmpegResult.errors);
  warnings.push(...ffmpegResult.warnings);

  // --- Backward PTS/DTS quality flag ---
  const dtsLines = ffmpegResult.dtsLines;
  if (dtsLines.length > 0) {
    // Try to extract the dominant jump magnitude
    const magnitudes = dtsLines.map(parseDtsMagnitude).filter((v): v is number => v !== null);
    const unique = [...new Set(magnitudes.map(v => v.toFixed(3)))];
    const repeated = magnitudes.length > 1 && unique.length === 1;
    const magStr = magnitudes.length > 0
      ? ` (${magnitudes[0].toFixed(3)}s${repeated ? ' repeated' : ''})`
      : '';

    qualityFlags.push({
      severity: 'FLAG',
      code: 'backward_pts',
      message: `backward PTS jumps${magStr} → timestamp disorder`,
      detail: `${dtsLines.length} occurrence(s) detected. Timestamp disorder causes decoders to produce out-of-order frames, which manifests as freezes or stuttering during playback. The file may be a flawed encode or a Blu-ray disc with non-standard timestamps.`,
    });
  }

  // --- GOP analysis (skipped if aborted) ---
  if (!signal?.aborted) {
    const gopFlags = await analyzeGop(filePath);
    qualityFlags.push(...gopFlags);
  }

  // Promote decode errors to quality flags too (mux-level)
  if (errors.length > 0 && errors.some(e => !e.startsWith('spawn error') && !e.startsWith('timeout'))) {
    qualityFlags.push({
      severity: 'FLAG',
      code: 'decode_error',
      message: `${errors.length} decode error(s) detected`,
      detail: errors.slice(0, 3).join(' | '),
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
