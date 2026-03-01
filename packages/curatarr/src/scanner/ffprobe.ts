/**
 * ffprobe runner and parser
 * Extracts video/audio quality data from media files.
 * All detection from actual stream data — no filename parsing.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { FileUpsert } from '../db/client.js';

const execFileAsync = promisify(execFile);
const FFPROBE_TIMEOUT_MS = 60_000; // 1 min — some large files are slow to probe

// ──────────────────────────────────────────────────────────────────
// Raw ffprobe JSON types
// ──────────────────────────────────────────────────────────────────

interface FfStream {
  index: number;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment';
  codec_name?: string;
  profile?: string;
  width?: number;
  height?: number;
  bit_rate?: string;         // string in ffprobe output
  bits_per_raw_sample?: string;
  r_frame_rate?: string;     // "24000/1001"
  avg_frame_rate?: string;
  color_transfer?: string;
  color_primaries?: string;
  channels?: number;
  channel_layout?: string;
  sample_rate?: string;
  pix_fmt?: string;          // "yuv420p10le" → bit_depth 10
  disposition?: {
    default?: number;
    forced?: number;
  };
  tags?: {
    language?: string;
    LANGUAGE?: string;
    title?: string;
  };
  side_data_list?: FfSideData[];
}

interface FfSideData {
  side_data_type: string;
  dv_profile?: number;
  dv_level?: number;
}

interface FfFormat {
  filename: string;
  format_name: string;       // "matroska,webm"
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FfProbeOutput {
  streams: FfStream[];
  format: FfFormat;
}

// ──────────────────────────────────────────────────────────────────
// Public result type
// ──────────────────────────────────────────────────────────────────

export interface ProbeResult {
  // Omit movieId and filePath — caller fills those
  resolution?: string;
  resolutionCat?: string;
  width?: number;
  height?: number;
  videoCodec?: string;
  videoBitrate?: number;
  bitDepth?: number;
  frameRate?: number;
  colorTransfer?: string;
  colorPrimaries?: string;
  hdrFormats: string[];
  dvProfile?: number;
  audioCodec?: string;
  audioProfile?: string;
  audioChannels?: number;
  audioLayout?: string;
  audioBitrate?: number;
  audioTracks: AudioTrack[];
  subtitleLangs: string[];
  fileSize?: number;
  duration?: number;
  container?: string;
  mbPerMinute?: number;
  ffprobeRaw: string;        // full JSON for reprocessing
}

export interface AudioTrack {
  index: number;
  codec: string;
  profile: string | null;
  channels: number;
  channelLayout: string;
  language: string;
  isDefault: boolean;
  bitrate: number;           // kbps; 0 for lossless
}

// ──────────────────────────────────────────────────────────────────
// HDR detection
// ──────────────────────────────────────────────────────────────────

function detectHdrFormats(videoStream: FfStream): string[] {
  const formats: Set<string> = new Set();

  for (const sd of videoStream.side_data_list ?? []) {
    const t = sd.side_data_type ?? '';
    if (t === 'DOVI configuration record') {
      formats.add('DolbyVision');
    }
    if (t === 'Mastering display metadata' || t === 'Content light level metadata') {
      formats.add('HDR10');
    }
    if (t === 'HDR10+ Dynamic Metadata SEI' || t.includes('HDR10+')) {
      formats.add('HDR10+');
    }
  }

  // HLG via color_transfer
  if (videoStream.color_transfer === 'arib-std-b67') {
    formats.add('HLG');
  }

  // HDR10 via PQ transfer + bt2020 primaries when no side_data (some encoders omit it)
  if (
    videoStream.color_transfer === 'smpte2084' &&
    videoStream.color_primaries === 'bt2020' &&
    !formats.has('DolbyVision') &&
    !formats.has('HDR10')
  ) {
    formats.add('HDR10');
  }

  return Array.from(formats);
}

// ──────────────────────────────────────────────────────────────────
// Bit depth detection
// ──────────────────────────────────────────────────────────────────

function detectBitDepth(stream: FfStream): number {
  // bits_per_raw_sample is most reliable
  if (stream.bits_per_raw_sample) {
    const n = parseInt(stream.bits_per_raw_sample, 10);
    if (!isNaN(n)) return n;
  }
  // Fall back to pix_fmt
  const pf = stream.pix_fmt ?? '';
  if (pf.includes('10le') || pf.includes('10be') || pf.endsWith('p10')) return 10;
  if (pf.includes('12le') || pf.includes('12be') || pf.endsWith('p12')) return 12;
  return 8;
}

// ──────────────────────────────────────────────────────────────────
// Resolution category
// ──────────────────────────────────────────────────────────────────

function categoriseResolution(width: number, height: number): string {
  // Use slightly relaxed width thresholds (~2% tolerance) to correctly
  // classify widescreen scope films (e.g. 1916×796 = 2.4:1) as 1080p
  // not 720p, since their height is below 1080 but width is ~1920.
  if (height >= 2160 || width >= 3800) return '2160p';
  if (height >= 1080 || width >= 1880) return '1080p';
  if (height >= 720  || width >= 1240) return '720p';
  if (height > 0) return '480p';
  return 'other';
}

// ──────────────────────────────────────────────────────────────────
// Frame rate from ffprobe fraction string
// ──────────────────────────────────────────────────────────────────

function parseFrameRate(s?: string): number | undefined {
  if (!s || s === '0/0') return undefined;
  const parts = s.split('/');
  if (parts.length !== 2) return undefined;
  const num = parseFloat(parts[0]);
  const den = parseFloat(parts[1]);
  if (!den) return undefined;
  return Math.round((num / den) * 1000) / 1000;
}

// ──────────────────────────────────────────────────────────────────
// Container normalisation
// ──────────────────────────────────────────────────────────────────

function normaliseContainer(formatName: string): string {
  if (formatName.includes('matroska')) return 'mkv';
  if (formatName.includes('mp4')) return 'mp4';
  if (formatName.includes('avi')) return 'avi';
  if (formatName.includes('m2ts') || formatName.includes('mpegts')) return 'm2ts';
  if (formatName.includes('mov')) return 'mov';
  return formatName.split(',')[0] ?? formatName;
}

// ──────────────────────────────────────────────────────────────────
// Parse ffprobe JSON output → ProbeResult
// ──────────────────────────────────────────────────────────────────

export function parseProbeOutput(raw: string): ProbeResult {
  const data: FfProbeOutput = JSON.parse(raw);
  const result: ProbeResult = {
    hdrFormats: [],
    audioTracks: [],
    subtitleLangs: [],
    ffprobeRaw: raw,
  };

  // ── Format level ──────────────────────────────────────────────
  const fmt = data.format;
  result.container = normaliseContainer(fmt.format_name);
  result.fileSize = fmt.size ? parseInt(fmt.size, 10) : undefined;
  result.duration = fmt.duration ? parseFloat(fmt.duration) : undefined;

  // ── Video stream ──────────────────────────────────────────────
  const videoStream = data.streams.find(s => s.codec_type === 'video' && s.codec_name !== 'mjpeg');
  if (videoStream) {
    result.videoCodec = videoStream.codec_name;
    result.colorTransfer = videoStream.color_transfer;
    result.colorPrimaries = videoStream.color_primaries;
    result.hdrFormats = detectHdrFormats(videoStream);
    result.bitDepth = detectBitDepth(videoStream);
    result.frameRate = parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate);

    const dvSd = videoStream.side_data_list?.find(sd => sd.side_data_type === 'DOVI configuration record');
    if (dvSd?.dv_profile != null) result.dvProfile = dvSd.dv_profile;

    if (videoStream.width && videoStream.height) {
      result.width = videoStream.width;
      result.height = videoStream.height;
      result.resolution = `${videoStream.width}x${videoStream.height}`;
      result.resolutionCat = categoriseResolution(videoStream.width, videoStream.height);
    }

    // Bitrate: prefer stream bit_rate, fall back to format bit_rate
    const streamBr = videoStream.bit_rate ? parseInt(videoStream.bit_rate, 10) : NaN;
    const fmtBr = fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : NaN;
    const br = !isNaN(streamBr) && streamBr > 0 ? streamBr : fmtBr;
    if (!isNaN(br) && br > 0) result.videoBitrate = Math.round(br / 1000); // → kbps
  }

  // ── Audio streams ─────────────────────────────────────────────
  const audioStreams = data.streams.filter(s => s.codec_type === 'audio');

  // Primary = first default, or first overall
  const primaryAudio = audioStreams.find(s => s.disposition?.default === 1) ?? audioStreams[0];

  if (primaryAudio) {
    result.audioCodec = primaryAudio.codec_name;
    result.audioProfile = primaryAudio.profile ?? undefined;
    result.audioChannels = primaryAudio.channels;
    result.audioLayout = primaryAudio.channel_layout;
    const abr = primaryAudio.bit_rate ? parseInt(primaryAudio.bit_rate, 10) : 0;
    result.audioBitrate = isNaN(abr) ? 0 : Math.round(abr / 1000);
  }

  result.audioTracks = audioStreams.map(s => ({
    index: s.index,
    codec: s.codec_name ?? 'unknown',
    profile: s.profile ?? null,
    channels: s.channels ?? 0,
    channelLayout: s.channel_layout ?? '',
    language: s.tags?.language ?? s.tags?.LANGUAGE ?? 'und',
    isDefault: s.disposition?.default === 1,
    bitrate: s.bit_rate ? Math.round(parseInt(s.bit_rate, 10) / 1000) : 0,
  }));

  // ── Subtitle streams ──────────────────────────────────────────
  const subtitleStreams = data.streams.filter(s => s.codec_type === 'subtitle');
  const langs = new Set<string>();
  for (const sub of subtitleStreams) {
    const lang = sub.tags?.language ?? sub.tags?.LANGUAGE;
    if (lang && lang !== 'und') langs.add(lang);
  }
  result.subtitleLangs = Array.from(langs);

  // ── Derived metrics ───────────────────────────────────────────
  if (result.fileSize && result.duration && result.duration > 0) {
    const fileSizeMb = result.fileSize / (1024 * 1024);
    const durationMin = result.duration / 60;
    result.mbPerMinute = Math.round((fileSizeMb / durationMin) * 100) / 100;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────
// Run ffprobe on a file
// ──────────────────────────────────────────────────────────────────

export async function probeFile(filePath: string): Promise<ProbeResult | { error: string }> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }
    );

    return parseProbeOutput(stdout);
  } catch (err) {
    return { error: (err as Error).message.slice(0, 500) };
  }
}

// ──────────────────────────────────────────────────────────────────
// Release group extraction from filename
// Handles: Name.Year.Quality.Codec-GROUP, Name (Year) [GROUP]
// ──────────────────────────────────────────────────────────────────

// Technical tokens that appear after dashes but are NOT release groups
const NON_GROUP_TOKENS = new Set([
  'DL', 'HD', 'UHD', 'SD', 'SDR', 'WEB', 'BD', 'BR',
  'RIP', 'WEBRIP', 'BDRIP', 'DVDRIP', 'HDTV', 'PDTV',
  'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC', 'AV1',
  'AAC', 'AC3', 'DTS', 'EAC3', 'FLAC', 'MP3', 'OPUS',
  'PROPER', 'REPACK', 'REMUX', 'EXTENDED', 'INTERNAL',
  'HDR', 'HDR10', 'HLG', 'SDR', '10BIT', '8BIT',
]);

export function extractReleaseGroup(filename: string): string | undefined {
  // Remove extension
  const base = filename.replace(/\.[^.]+$/, '');

  // 1. Bracket match: [GROUP] at end — highest confidence (YTS.MX, YTS.AG, etc.)
  const bracketMatch = base.match(/\[([A-Za-z0-9._-]{2,20})\]\s*$/);
  if (bracketMatch) return bracketMatch[1];

  // 2. Dash match: -GROUP at end — no dots (avoids matching WEB-DL.something)
  //    Require min 3 chars to skip 2-char tech abbreviations like -DL, -HD
  const dashMatch = base.match(/-([A-Za-z0-9]{3,20})$/);
  if (dashMatch) {
    const candidate = dashMatch[1];
    if (!NON_GROUP_TOKENS.has(candidate.toUpperCase())) return candidate;
  }

  return undefined;
}

// ──────────────────────────────────────────────────────────────────
// Map ProbeResult → FileUpsert fields (caller provides movieId+paths)
// ──────────────────────────────────────────────────────────────────

export function probeToUpsert(
  probe: ProbeResult,
  movieId: number,
  filePath: string,
  filename: string
): Omit<FileUpsert, never> {
  return {
    movieId,
    filePath,
    filename,
    resolution: probe.resolution,
    resolutionCat: probe.resolutionCat,
    width: probe.width,
    height: probe.height,
    videoCodec: probe.videoCodec,
    videoBitrate: probe.videoBitrate,
    bitDepth: probe.bitDepth,
    frameRate: probe.frameRate,
    colorTransfer: probe.colorTransfer,
    colorPrimaries: probe.colorPrimaries,
    hdrFormats: probe.hdrFormats,
    dvProfile: probe.dvProfile,
    audioCodec: probe.audioCodec,
    audioProfile: probe.audioProfile ?? undefined,
    audioChannels: probe.audioChannels,
    audioLayout: probe.audioLayout ?? undefined,
    audioBitrate: probe.audioBitrate,
    audioTracks: probe.audioTracks,
    subtitleLangs: probe.subtitleLangs,
    fileSize: probe.fileSize,
    duration: probe.duration,
    container: probe.container,
    mbPerMinute: probe.mbPerMinute,
    releaseGroup: extractReleaseGroup(filename),
    ffprobeRaw: probe.ffprobeRaw,
  };
}
