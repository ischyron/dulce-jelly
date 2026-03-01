/**
 * Quality report generator
 * Queries SQLite for insights about the library.
 */

import type { CuratDb } from '../db/client.js';

// ──────────────────────────────────────────────────────────────────
// Status report
// ──────────────────────────────────────────────────────────────────

export function printStatus(db: CuratDb): void {
  const stats = db.getStats();
  const lastRun = db.getLastScanRun() as {
    started_at: string;
    finished_at: string | null;
    root_path: string;
    scanned_ok: number;
    scan_errors: number;
    duration_sec: number | null;
  } | undefined;

  console.log('\n── Curatarr Library Status ─────────────────────────────────');
  console.log(`  Movies in DB :  ${stats.totalMovies}`);
  console.log(`  Files in DB  :  ${stats.totalFiles}`);
  console.log(`  Scanned      :  ${stats.scannedFiles}`);
  console.log(`  Scan errors  :  ${stats.errorFiles}`);
  console.log(`  JF enriched  :  ${stats.jfEnriched} (${Math.round(stats.jfEnriched / Math.max(1, stats.totalMovies) * 100)}%)`);

  if (lastRun) {
    console.log(`\n── Last Scan ──────────────────────────────────────────────`);
    console.log(`  Root         : ${lastRun.root_path}`);
    console.log(`  Started      : ${lastRun.started_at}`);
    console.log(`  Duration     : ${lastRun.duration_sec != null ? `${lastRun.duration_sec.toFixed(0)}s` : 'running'}`);
    console.log(`  OK / Errors  : ${lastRun.scanned_ok} / ${lastRun.scan_errors}`);
  }

  console.log('\n── Resolution Distribution ────────────────────────────────');
  for (const [cat, count] of Object.entries(stats.resolutionDist).sort()) {
    const bar = '█'.repeat(Math.round(count / Math.max(1, stats.scannedFiles) * 30));
    console.log(`  ${cat.padEnd(8)} ${String(count).padStart(5)}  ${bar}`);
  }

  console.log('\n── Codec Distribution ──────────────────────────────────────');
  for (const [codec, count] of Object.entries(stats.codecDist)) {
    console.log(`  ${(codec ?? 'unknown').padEnd(14)} ${String(count).padStart(5)}`);
  }

  console.log('\n── HDR ─────────────────────────────────────────────────────');
  console.log(`  Any HDR      :  ${stats.hdrCount}`);
  console.log(`  Dolby Vision :  ${stats.dolbyVisionCount}`);
  console.log('');
}

// ──────────────────────────────────────────────────────────────────
// Upgrade candidates
// ──────────────────────────────────────────────────────────────────

const LQ_GROUPS = ['YTS.MX', 'YTS', 'YTS.AG', 'YTS.LT', 'YTS.AM', 'YIFY', 'EVO', 'FGT'];

export function printUpgradeCandidates(db: CuratDb, opts: {
  limit?: number;
  minCriticRating?: number;
  minCommunityRating?: number;
  maxResolution?: string;
  lqGroupsOnly?: boolean;
  skipRatingFilter?: boolean;   // useful before jf-sync; shows LQ groups regardless of rating
} = {}): void {
  const candidates = db.getUpgradeCandidates({
    maxResolution: opts.maxResolution ?? '1080p',
    releaseGroups: opts.lqGroupsOnly !== false ? LQ_GROUPS : undefined,
    minCriticRating: opts.skipRatingFilter ? undefined : opts.minCriticRating,
    minCommunityRating: opts.skipRatingFilter ? undefined : (opts.minCommunityRating ?? 7.0),
    limit: opts.limit ?? 50,
  });

  if (candidates.length === 0) {
    console.log('No upgrade candidates found with current filters.');
    return;
  }

  console.log(`\n── Upgrade Candidates (${candidates.length}) ────────────────────────────────`);
  console.log('  (LQ release groups + community rating ≥ 7.0, resolution ≤ 1080p)');
  console.log('');
  console.log(
    '  ' +
    'Title'.padEnd(42) +
    'Year'.padEnd(6) +
    'Res'.padEnd(8) +
    'Codec'.padEnd(8) +
    'Group'.padEnd(14) +
    'MC'.padEnd(6) +
    'IMDb'
  );
  console.log('  ' + '─'.repeat(100));

  for (const row of candidates) {
    const title = (row.jellyfin_title ?? row.parsed_title ?? row.folder_name).slice(0, 40);
    const year = String(row.jellyfin_year ?? row.parsed_year ?? '').padEnd(6);
    const res = (row.resolution_cat ?? '?').padEnd(8);
    const codec = (row.video_codec ?? '?').padEnd(8);
    const group = (row.release_group ?? '?').padEnd(14);
    const mc = row.critic_rating != null ? String(row.critic_rating).padEnd(6) : '?     ';
    const imdb = row.community_rating != null ? row.community_rating.toFixed(1) : '?';
    console.log(`  ${title.padEnd(42)}${year}${res}${codec}${group}${mc}${imdb}`);
  }
  console.log('');
}

// ──────────────────────────────────────────────────────────────────
// Suspicious files (size anomalies vs claimed quality)
// ──────────────────────────────────────────────────────────────────

interface SuspiciousFile {
  movie_folder: string;
  file_path: string;
  resolution_cat: string;
  mb_per_minute: number;
  expected_min: number;
  video_codec: string;
}

const MIN_MB_PER_MIN: Record<string, number> = {
  // Thresholds tuned for detecting TRUE fakes (upscale claiming higher res).
  // Efficient HEVC encodes (YTS 4K) legitimately sit at 40-50 MB/min.
  // Only files claiming a resolution but encoded at 1-2x the next tier down are suspicious.
  '2160p': 4,    // < 4 MB/min at 4K = almost certainly a 1080p upscale
  '1080p': 1.5,  // < 1.5 MB/min at 1080p = likely a 720p encode
  '720p':  0.8,
  '480p':  0.3,
};

export function printSuspiciousFiles(db: CuratDb, limit = 30): void {
  const raw = db.raw();

  // Find files where size is suspiciously low for the claimed resolution
  // Build a CASE expression for the threshold
  const rows = raw.prepare(`
    SELECT
      m.folder_name  AS movie_folder,
      f.file_path,
      f.resolution_cat,
      f.mb_per_minute,
      f.video_codec,
      f.release_group,
      CASE f.resolution_cat
        WHEN '2160p' THEN 15
        WHEN '1080p' THEN 5
        WHEN '720p'  THEN 2
        WHEN '480p'  THEN 1
        ELSE 0
      END AS expected_min
    FROM files f
    JOIN movies m ON m.id = f.movie_id
    WHERE f.scanned_at IS NOT NULL
      AND f.mb_per_minute IS NOT NULL
      AND f.mb_per_minute < CASE f.resolution_cat
        WHEN '2160p' THEN 15
        WHEN '1080p' THEN 5
        WHEN '720p'  THEN 2
        WHEN '480p'  THEN 1
        ELSE 999
      END
    ORDER BY (expected_min - f.mb_per_minute) DESC
    LIMIT ?
  `).all(limit) as SuspiciousFile[];

  if (rows.length === 0) {
    console.log('No suspicious files found.');
    return;
  }

  console.log(`\n── Suspicious Files (low MB/min for claimed resolution) ──── top ${rows.length}`);
  console.log('');
  console.log(
    '  ' +
    'Movie'.padEnd(42) +
    'Res'.padEnd(8) +
    'MB/min'.padEnd(10) +
    'Expected'.padEnd(12) +
    'Codec'
  );
  console.log('  ' + '─'.repeat(90));

  for (const row of rows) {
    const movie = (row.movie_folder ?? '?').slice(0, 40).padEnd(42);
    const res = (row.resolution_cat ?? '?').padEnd(8);
    const actual = (row.mb_per_minute?.toFixed(1) ?? '?').padEnd(10);
    const expected = (`≥ ${row.expected_min} MB/min`).padEnd(12);
    const codec = row.video_codec ?? '?';
    console.log(`  ${movie}${res}${actual}${expected}${codec}`);
  }
  console.log('');
}

// ──────────────────────────────────────────────────────────────────
// HDR breakdown
// ──────────────────────────────────────────────────────────────────

export function printHdrBreakdown(db: CuratDb): void {
  const raw = db.raw();

  const hdrRows = raw.prepare(`
    SELECT hdr_formats, COUNT(*) as n
    FROM files
    WHERE scanned_at IS NOT NULL AND hdr_formats != '[]'
    GROUP BY hdr_formats
    ORDER BY n DESC
    LIMIT 20
  `).all() as { hdr_formats: string; n: number }[];

  if (hdrRows.length === 0) {
    console.log('No HDR files found.');
    return;
  }

  console.log('\n── HDR Format Breakdown ────────────────────────────────────');
  for (const row of hdrRows) {
    let formats: string[];
    try { formats = JSON.parse(row.hdr_formats); } catch { formats = [row.hdr_formats]; }
    console.log(`  ${formats.join(' + ').padEnd(30)} ${row.n}`);
  }
  console.log('');
}

// ──────────────────────────────────────────────────────────────────
// Audio breakdown
// ──────────────────────────────────────────────────────────────────

export function printAudioBreakdown(db: CuratDb): void {
  const raw = db.raw();

  const rows = raw.prepare(`
    SELECT
      audio_codec,
      audio_profile,
      audio_channels,
      COUNT(*) as n
    FROM files
    WHERE scanned_at IS NOT NULL AND audio_codec IS NOT NULL
    GROUP BY audio_codec, audio_profile, audio_channels
    ORDER BY n DESC
    LIMIT 20
  `).all() as { audio_codec: string; audio_profile: string | null; audio_channels: number | null; n: number }[];

  console.log('\n── Audio Breakdown ─────────────────────────────────────────');
  for (const row of rows) {
    const profile = row.audio_profile ? ` (${row.audio_profile})` : '';
    const ch = row.audio_channels ? ` ${row.audio_channels}ch` : '';
    console.log(`  ${(row.audio_codec + profile + ch).padEnd(40)} ${row.n}`);
  }
  console.log('');
}
