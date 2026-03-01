/**
 * ffprobe parser tests
 * Tests against real files in ~/Media/MEDIA1/Movies
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Import compiled JS
const { parseProbeOutput, extractReleaseGroup, probeFile } = await import('../dist/scanner/ffprobe.js');

// ──────────────────────────────────────────────────────────────────
// extractReleaseGroup
// ──────────────────────────────────────────────────────────────────

describe('extractReleaseGroup', () => {
  test('extracts bracket group', () => {
    const g = extractReleaseGroup('Movie.2020.2160p.BluRay.x265-[YTS.MX].mkv');
    assert.equal(g, 'YTS.MX');
  });

  test('extracts dash group', () => {
    const g = extractReleaseGroup('Movie.2020.1080p.BluRay.x264-AMIABLE.mkv');
    assert.equal(g, 'AMIABLE');
  });

  test('returns undefined when no group', () => {
    const g = extractReleaseGroup('Movie 2020.mkv');
    assert.equal(g, undefined);
  });

  test('handles YTS bracket format', () => {
    const g = extractReleaseGroup('12.Angry.Men.1957.2160p.4K.BluRay.x265.10bit.AAC5.1-[YTS.MX].mkv');
    assert.equal(g, 'YTS.MX');
  });
});

// ──────────────────────────────────────────────────────────────────
// parseProbeOutput — unit test with synthetic data
// ──────────────────────────────────────────────────────────────────

describe('parseProbeOutput', () => {
  const syntheticHevc4k = JSON.stringify({
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'hevc',
        profile: 'Main 10',
        width: 3840,
        height: 2160,
        bit_rate: '15000000',
        bits_per_raw_sample: '10',
        pix_fmt: 'yuv420p10le',
        r_frame_rate: '24/1',
        avg_frame_rate: '24/1',
        color_transfer: 'smpte2084',
        color_primaries: 'bt2020',
        side_data_list: [
          {
            side_data_type: 'DOVI configuration record',
            dv_profile: 8,
            dv_level: 6,
          },
          {
            side_data_type: 'Mastering display metadata',
          },
        ],
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'truehd',
        profile: 'TrueHD + Atmos',
        channels: 8,
        channel_layout: '7.1',
        bit_rate: '0',
        disposition: { default: 1 },
        tags: { language: 'eng' },
      },
      {
        index: 2,
        codec_type: 'audio',
        codec_name: 'ac3',
        channels: 6,
        channel_layout: '5.1',
        bit_rate: '640000',
        disposition: { default: 0 },
        tags: { language: 'fra' },
      },
      {
        index: 3,
        codec_type: 'subtitle',
        tags: { language: 'eng' },
      },
    ],
    format: {
      filename: '/tmp/test.mkv',
      format_name: 'matroska,webm',
      duration: '7200.0',
      size: '50000000000',
      bit_rate: '55000000',
    },
  });

  test('detects 4K resolution', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.resolutionCat, '2160p');
    assert.equal(r.width, 3840);
    assert.equal(r.height, 2160);
  });

  test('detects HEVC codec', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.videoCodec, 'hevc');
  });

  test('detects 10-bit depth', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.bitDepth, 10);
  });

  test('detects Dolby Vision + HDR10', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.ok(r.hdrFormats.includes('DolbyVision'), `hdrFormats=${JSON.stringify(r.hdrFormats)}`);
    assert.ok(r.hdrFormats.includes('HDR10'), `hdrFormats=${JSON.stringify(r.hdrFormats)}`);
    assert.equal(r.dvProfile, 8);
  });

  test('detects TrueHD Atmos primary audio', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.audioCodec, 'truehd');
    assert.equal(r.audioProfile, 'TrueHD + Atmos');
    assert.equal(r.audioChannels, 8);
    assert.equal(r.audioLayout, '7.1');
  });

  test('captures all audio tracks', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.audioTracks.length, 2);
    assert.equal(r.audioTracks[0].language, 'eng');
    assert.equal(r.audioTracks[1].language, 'fra');
  });

  test('captures subtitle languages', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.ok(r.subtitleLangs.includes('eng'));
  });

  test('calculates MB/min', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    // 50_000_000_000 bytes / (1024*1024 MB) / (7200/60 min) ≈ 397 MB/min
    assert.ok(r.mbPerMinute && r.mbPerMinute > 350, `mbPerMinute=${r.mbPerMinute}`);
  });

  test('detects container as mkv', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.container, 'mkv');
  });

  test('detects 24fps', () => {
    const r = parseProbeOutput(syntheticHevc4k);
    assert.equal(r.frameRate, 24);
  });

  // HLG test
  test('detects HLG via color_transfer', () => {
    const hlgData = JSON.stringify({
      streams: [{
        index: 0, codec_type: 'video', codec_name: 'hevc',
        width: 3840, height: 2160,
        color_transfer: 'arib-std-b67', color_primaries: 'bt2020',
        avg_frame_rate: '25/1',
      }],
      format: { format_name: 'matroska,webm', duration: '3600' },
    });
    const r = parseProbeOutput(hlgData);
    assert.ok(r.hdrFormats.includes('HLG'), `hdrFormats=${JSON.stringify(r.hdrFormats)}`);
    assert.ok(!r.hdrFormats.includes('HDR10'), 'HLG should not be classified as HDR10');
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: probe a real file
// ──────────────────────────────────────────────────────────────────

const REAL_FILE = path.join(
  os.homedir(),
  'Media/MEDIA1/Movies/12 Angry Men (1957)/12.Angry.Men.1957.2160p.4K.BluRay.x265.10bit.AAC5.1-[YTS.MX].mkv'
);

test('probes a real file (integration)', { skip: !existsSync(REAL_FILE) }, async () => {
  const result = await probeFile(REAL_FILE);
  assert.ok(!('error' in result), `probe failed: ${result.error ?? ''}`);
  if ('error' in result) return;

  assert.equal(result.resolutionCat, '2160p');
  assert.equal(result.videoCodec, 'hevc');
  assert.equal(result.bitDepth, 10);
  assert.ok(result.fileSize && result.fileSize > 0, 'fileSize should be > 0');
  assert.ok(result.duration && result.duration > 0, 'duration should be > 0');
  assert.ok(result.mbPerMinute && result.mbPerMinute > 0, 'mbPerMinute should be > 0');
  assert.equal(result.container, 'mkv');
  // YTS 2160p files are typically 6-20 MB/min — check sanity
  assert.ok(result.mbPerMinute < 100, `mbPerMinute=${result.mbPerMinute} seems too high`);

  console.log(`  Real file probe:`);
  console.log(`    Resolution : ${result.resolution} (${result.resolutionCat})`);
  console.log(`    Codec      : ${result.videoCodec} ${result.bitDepth}bit`);
  console.log(`    HDR        : ${result.hdrFormats.join(', ') || 'none'}`);
  console.log(`    DV profile : ${result.dvProfile ?? 'n/a'}`);
  console.log(`    Audio      : ${result.audioCodec} ${result.audioChannels}ch`);
  console.log(`    Size       : ${result.fileSize ? (result.fileSize / 1e9).toFixed(2) : '?'} GB`);
  console.log(`    Duration   : ${result.duration ? (result.duration / 60).toFixed(1) : '?'} min`);
  console.log(`    MB/min     : ${result.mbPerMinute}`);
});
