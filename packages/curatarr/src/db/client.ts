/**
 * Curatarr DB client
 * Typed wrappers around better-sqlite3 for all curatarr tables.
 */

import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { applySchema } from './schema.js';

export interface MovieRow {
  id: number;
  folder_path: string;
  folder_name: string;
  parsed_title: string | null;
  parsed_year: number | null;
  jellyfin_id: string | null;
  jellyfin_title: string | null;
  jellyfin_year: number | null;
  imdb_id: string | null;
  tmdb_id: string | null;
  critic_rating: number | null;
  community_rating: number | null;
  genres: string | null; // JSON array string
  overview: string | null;
  jellyfin_path: string | null;
  jf_synced_at: string | null;
  // v6 curatarr augmentation
  tags: string; // JSON array of user tags
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: number;
  movie_id: number;
  file_path: string;
  filename: string;
  resolution: string | null;
  resolution_cat: string | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  video_bitrate: number | null;
  bit_depth: number | null;
  frame_rate: number | null;
  color_transfer: string | null;
  color_primaries: string | null;
  hdr_formats: string; // JSON array string
  dv_profile: number | null;
  audio_codec: string | null;
  audio_profile: string | null;
  audio_channels: number | null;
  audio_layout: string | null;
  audio_bitrate: number | null;
  audio_tracks: string; // JSON array string
  subtitle_langs: string; // JSON array string
  file_size: number | null;
  duration: number | null;
  container: string | null;
  mb_per_minute: number | null;
  release_group: string | null;
  ffprobe_raw: string | null;
  scanned_at: string | null;
  scan_error: string | null;
  // v5 verify columns
  verify_status: string | null; // 'pending'|'pass'|'fail'|'error'
  verify_errors: string | null; // JSON array of error strings
  verified_at: string | null;
  // v8 quality analytics
  quality_flags: string; // JSON array of {severity,code,message,detail?}
  created_at: string;
  updated_at: string;
}

export interface DisambiguationLogRow {
  id: number;
  job_id: string;
  request_id: string;
  input_title: string;
  input_year: number | null;
  method: string | null;
  confidence: number | null;
  matched_movie_id: number | null;
  ambiguous: number;
  reason: string | null;
  reviewed: number;
  created_at: string;
  // Joined from movies table (populated by getAmbiguousDisambiguations)
  db_folder_name?: string | null;
  db_folder_path?: string | null;
  db_parsed_year?: number | null;
}

export interface UnmatchedMovieRow {
  id: number;
  folder_name: string;
  parsed_title: string | null;
  parsed_year: number | null;
  jellyfin_id: string | null;
}

export interface MovieUpsert {
  folderPath: string;
  folderName: string;
  parsedTitle?: string;
  parsedYear?: number;
}

export interface FileUpsert {
  movieId: number;
  filePath: string;
  filename: string;
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
  hdrFormats?: string[];
  dvProfile?: number;
  audioCodec?: string;
  audioProfile?: string;
  audioChannels?: number;
  audioLayout?: string;
  audioBitrate?: number;
  audioTracks?: object[];
  subtitleLangs?: string[];
  fileSize?: number;
  duration?: number;
  container?: string;
  mbPerMinute?: number;
  releaseGroup?: string;
  ffprobeRaw?: string;
  scanError?: string;
}

/** Flat join row returned by getUpgradeCandidates */
export interface UpgradeCandidate extends MovieRow {
  filename: string | null;
  resolution_cat: string | null;
  video_codec: string | null;
  audio_codec: string | null;
  file_size: number | null;
  mb_per_minute: number | null;
  release_group: string | null;
  hdr_formats: string;
  file_id: number;
  file_file_path: string;
}

export interface JellyfinEnrichment {
  jellyfinId: string;
  jellyfinTitle?: string;
  jellyfinYear?: number;
  imdbId?: string;
  tmdbId?: string;
  criticRating?: number;
  communityRating?: number;
  genres?: string[];
  overview?: string;
  jellyfinPath?: string;
}

export class CuratDb {
  private db: Database.Database;
  private static readonly SCAN_HISTORY_MAX_RUNS = 200;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    applySchema(this.db);
  }

  // ──────────────────────────────────────────────────────────────────
  // Movies
  // ──────────────────────────────────────────────────────────────────

  upsertMovie(data: MovieUpsert): number {
    const existing = this.db.prepare('SELECT id FROM movies WHERE folder_path = ?').get(data.folderPath) as
      | { id: number }
      | undefined;

    if (existing) {
      this.db
        .prepare(`
        UPDATE movies SET
          folder_name  = ?,
          parsed_title = ?,
          parsed_year  = ?,
          updated_at   = datetime('now')
        WHERE id = ?
      `)
        .run(data.folderName, data.parsedTitle ?? null, data.parsedYear ?? null, existing.id);
      return existing.id;
    }

    const result = this.db
      .prepare(`
      INSERT INTO movies (folder_path, folder_name, parsed_title, parsed_year)
      VALUES (?, ?, ?, ?)
    `)
      .run(data.folderPath, data.folderName, data.parsedTitle ?? null, data.parsedYear ?? null);
    return Number(result.lastInsertRowid);
  }

  enrichFromJellyfin(folderPath: string, enrich: JellyfinEnrichment): boolean {
    const result = this.db
      .prepare(`
      UPDATE movies SET
        jellyfin_id      = ?,
        jellyfin_title   = ?,
        jellyfin_year    = ?,
        imdb_id          = ?,
        tmdb_id          = ?,
        critic_rating    = ?,
        community_rating = ?,
        genres           = ?,
        overview         = ?,
        jellyfin_path    = ?,
        jf_synced_at     = datetime('now'),
        updated_at       = datetime('now')
      WHERE folder_path = ?
    `)
      .run(
        enrich.jellyfinId,
        enrich.jellyfinTitle ?? null,
        enrich.jellyfinYear ?? null,
        enrich.imdbId ?? null,
        enrich.tmdbId ?? null,
        enrich.criticRating ?? null,
        enrich.communityRating ?? null,
        enrich.genres ? JSON.stringify(enrich.genres) : null,
        enrich.overview ?? null,
        enrich.jellyfinPath ?? null,
        folderPath,
      );
    return result.changes > 0;
  }

  /** Find movie by Jellyfin path (exact) or parsed title+year */
  findMovieByPath(filePath: string): MovieRow | undefined {
    return this.db.prepare('SELECT * FROM movies WHERE folder_path = ? OR jellyfin_path = ?').get(filePath, filePath) as
      | MovieRow
      | undefined;
  }

  findMovieByTitleYear(title: string, year: number): MovieRow | undefined {
    // Try parsed_title first, then folder_name contains
    return this.db
      .prepare(
        `SELECT * FROM movies
       WHERE (parsed_title = ? OR jellyfin_title = ?) AND (parsed_year = ? OR jellyfin_year = ?)
       LIMIT 1`,
      )
      .get(title, title, year, year) as MovieRow | undefined;
  }

  getAllMovies(): MovieRow[] {
    return this.db.prepare('SELECT * FROM movies ORDER BY parsed_year DESC, folder_name ASC').all() as MovieRow[];
  }

  getMovieById(id: number): MovieRow | undefined {
    return this.db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as MovieRow | undefined;
  }

  deleteMovie(id: number): boolean {
    const r = this.db.prepare('DELETE FROM movies WHERE id = ?').run(id);
    return r.changes > 0;
  }

  deleteMovies(ids: number[]): number {
    if (ids.length === 0) return 0;
    const del = this.db.prepare('DELETE FROM movies WHERE id = ?');
    const tx = this.db.transaction((movieIds: number[]) => {
      let removed = 0;
      for (const id of movieIds) {
        removed += del.run(id).changes;
      }
      return removed;
    });
    return tx(ids);
  }

  getMovieByJellyfinId(jellyfinId: string): MovieRow | undefined {
    return this.db.prepare('SELECT * FROM movies WHERE jellyfin_id = ?').get(jellyfinId) as MovieRow | undefined;
  }

  /** Update user-editable curatarr augmentation (tags, notes) */
  updateMovieMeta(id: number, meta: { tags?: string[]; notes?: string }): boolean {
    const sets: string[] = [];
    const vals: (string | null)[] = [];
    if (meta.tags !== undefined) {
      sets.push('tags = ?');
      vals.push(JSON.stringify(meta.tags));
    }
    if (meta.notes !== undefined) {
      sets.push('notes = ?');
      vals.push(meta.notes ?? null);
    }
    if (sets.length === 0) return false;
    sets.push("updated_at = datetime('now')");
    const r = this.db.prepare(`UPDATE movies SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    return r.changes > 0;
  }

  /** Distinct sorted set of all tags used across movies */
  getAllTags(): string[] {
    const rows = this.db.prepare("SELECT tags FROM movies WHERE tags IS NOT NULL AND tags != '[]'").all() as Array<{
      tags: string | null;
    }>;
    const set = new Set<string>();
    for (const row of rows) {
      if (!row.tags) continue;
      try {
        const arr = JSON.parse(row.tags) as unknown;
        if (!Array.isArray(arr)) continue;
        for (const t of arr) {
          if (typeof t !== 'string') continue;
          const v = t.trim();
          if (v) set.add(v);
        }
      } catch {
        // Skip malformed rows.
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /** Batch-merge tags into selected movies. Returns updated row count. */
  batchAddTags(ids: number[], tags: string[]): number {
    if (ids.length === 0 || tags.length === 0) return 0;
    const getOne = this.db.prepare('SELECT tags FROM movies WHERE id = ?') as Database.Statement<
      [number],
      { tags: string }
    >;
    const setOne = this.db.prepare("UPDATE movies SET tags = ?, updated_at = datetime('now') WHERE id = ?");
    const tx = this.db.transaction((movieIds: number[], addTags: string[]) => {
      let updated = 0;
      for (const id of movieIds) {
        const row = getOne.get(id);
        if (!row) continue;
        let curr: string[] = [];
        try {
          const parsed = JSON.parse(row.tags) as unknown;
          if (Array.isArray(parsed)) curr = parsed.filter((v) => typeof v === 'string') as string[];
        } catch {
          curr = [];
        }
        const merged = Array.from(new Set([...curr, ...addTags]));
        if (JSON.stringify(merged) !== JSON.stringify(curr)) {
          updated += setOne.run(JSON.stringify(merged), id).changes;
        }
      }
      return updated;
    });
    return tx(ids, tags);
  }

  /** Batch-remove tags from selected movies. Returns updated row count. */
  batchRemoveTags(ids: number[], tags: string[]): number {
    if (ids.length === 0 || tags.length === 0) return 0;
    const toRemove = new Set(tags);
    const getOne = this.db.prepare('SELECT tags FROM movies WHERE id = ?') as Database.Statement<
      [number],
      { tags: string }
    >;
    const setOne = this.db.prepare("UPDATE movies SET tags = ?, updated_at = datetime('now') WHERE id = ?");
    const tx = this.db.transaction((movieIds: number[]) => {
      let updated = 0;
      for (const id of movieIds) {
        const row = getOne.get(id);
        if (!row) continue;
        let curr: string[] = [];
        try {
          const parsed = JSON.parse(row.tags) as unknown;
          if (Array.isArray(parsed)) curr = parsed.filter((v) => typeof v === 'string') as string[];
        } catch {
          curr = [];
        }
        const next = curr.filter((t) => !toRemove.has(t));
        if (JSON.stringify(next) !== JSON.stringify(curr)) {
          updated += setOne.run(JSON.stringify(next), id).changes;
        }
      }
      return updated;
    });
    return tx(ids);
  }

  /** Re-apply Jellyfin enrichment for a movie by ID (used by jf-refresh endpoint) */
  enrichMovieById(id: number, enrich: JellyfinEnrichment): boolean {
    const result = this.db
      .prepare(`
      UPDATE movies SET
        jellyfin_id      = ?,
        jellyfin_title   = ?,
        jellyfin_year    = ?,
        imdb_id          = ?,
        tmdb_id          = ?,
        critic_rating    = ?,
        community_rating = ?,
        genres           = ?,
        overview         = ?,
        jellyfin_path    = ?,
        jf_synced_at     = datetime('now'),
        updated_at       = datetime('now')
      WHERE id = ?
    `)
      .run(
        enrich.jellyfinId,
        enrich.jellyfinTitle ?? null,
        enrich.jellyfinYear ?? null,
        enrich.imdbId ?? null,
        enrich.tmdbId ?? null,
        enrich.criticRating ?? null,
        enrich.communityRating ?? null,
        enrich.genres ? JSON.stringify(enrich.genres) : null,
        enrich.overview ?? null,
        enrich.jellyfinPath ?? null,
        id,
      );
    return result.changes > 0;
  }

  // ──────────────────────────────────────────────────────────────────
  // Files
  // ──────────────────────────────────────────────────────────────────

  upsertFile(data: FileUpsert): number {
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id FROM files WHERE file_path = ?').get(data.filePath) as
      | { id: number }
      | undefined;

    const params = [
      data.movieId,
      data.filename,
      data.resolution ?? null,
      data.resolutionCat ?? null,
      data.width ?? null,
      data.height ?? null,
      data.videoCodec ?? null,
      data.videoBitrate ?? null,
      data.bitDepth ?? null,
      data.frameRate ?? null,
      data.colorTransfer ?? null,
      data.colorPrimaries ?? null,
      JSON.stringify(data.hdrFormats ?? []),
      data.dvProfile ?? null,
      data.audioCodec ?? null,
      data.audioProfile ?? null,
      data.audioChannels ?? null,
      data.audioLayout ?? null,
      data.audioBitrate ?? null,
      JSON.stringify(data.audioTracks ?? []),
      JSON.stringify(data.subtitleLangs ?? []),
      data.fileSize ?? null,
      data.duration ?? null,
      data.container ?? null,
      data.mbPerMinute ?? null,
      data.releaseGroup ?? null,
      data.ffprobeRaw ?? null,
      data.scanError ? null : now, // scanned_at only set on success
      data.scanError ?? null,
    ];

    if (existing) {
      this.db
        .prepare(`
        UPDATE files SET
          movie_id        = ?,
          filename        = ?,
          resolution      = ?,
          resolution_cat  = ?,
          width           = ?,
          height          = ?,
          video_codec     = ?,
          video_bitrate   = ?,
          bit_depth       = ?,
          frame_rate      = ?,
          color_transfer  = ?,
          color_primaries = ?,
          hdr_formats     = ?,
          dv_profile      = ?,
          audio_codec     = ?,
          audio_profile   = ?,
          audio_channels  = ?,
          audio_layout    = ?,
          audio_bitrate   = ?,
          audio_tracks    = ?,
          subtitle_langs  = ?,
          file_size       = ?,
          duration        = ?,
          container       = ?,
          mb_per_minute   = ?,
          release_group   = ?,
          ffprobe_raw     = ?,
          scanned_at      = ?,
          scan_error      = ?,
          updated_at      = datetime('now')
        WHERE id = ?
      `)
        .run(...params, existing.id);
      return existing.id;
    }

    const result = this.db
      .prepare(`
      INSERT INTO files (
        movie_id, filename, resolution, resolution_cat, width, height,
        video_codec, video_bitrate, bit_depth, frame_rate,
        color_transfer, color_primaries, hdr_formats, dv_profile,
        audio_codec, audio_profile, audio_channels, audio_layout, audio_bitrate,
        audio_tracks, subtitle_langs,
        file_size, duration, container, mb_per_minute,
        release_group, ffprobe_raw, scanned_at, scan_error, file_path
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )
    `)
      .run(...params, data.filePath);
    return Number(result.lastInsertRowid);
  }

  getFilesForMovie(movieId: number): FileRow[] {
    return this.db.prepare('SELECT * FROM files WHERE movie_id = ? ORDER BY file_size DESC').all(movieId) as FileRow[];
  }

  getAllFiles(): FileRow[] {
    return this.db.prepare('SELECT * FROM files ORDER BY id').all() as FileRow[];
  }

  getUnscannedFiles(): FileRow[] {
    return this.db.prepare('SELECT * FROM files WHERE scanned_at IS NULL AND scan_error IS NULL').all() as FileRow[];
  }

  /**
   * Remove file rows under a library root that are no longer present in the latest walk.
   * Returns number of deleted rows.
   */
  pruneMissingFilesUnderRoot(rootPath: string, presentFilePaths: Set<string>): number {
    const prefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    const rows = this.db.prepare('SELECT id, file_path FROM files WHERE file_path LIKE ?').all(`${prefix}%`) as Array<{
      id: number;
      file_path: string;
    }>;

    const del = this.db.prepare('DELETE FROM files WHERE id = ?');
    const tx = this.db.transaction((candidates: Array<{ id: number; file_path: string }>) => {
      let removed = 0;
      for (const row of candidates) {
        if (presentFilePaths.has(row.file_path)) continue;
        removed += del.run(row.id).changes;
      }
      return removed;
    });
    return tx(rows);
  }

  // ──────────────────────────────────────────────────────────────────
  // Stats & Reports
  // ──────────────────────────────────────────────────────────────────

  getStats(): {
    totalMovies: number;
    totalFiles: number;
    scannedFiles: number;
    errorFiles: number;
    jfEnriched: number;
    totalLibrarySize: number;
    resolutionDist: Record<string, number>;
    codecDist: Record<string, number>;
    audioCodecDist: Record<string, number>;
    hdrCount: number;
    dolbyVisionCount: number;
  } {
    const totalMovies = (this.db.prepare('SELECT COUNT(*) as n FROM movies').get() as { n: number }).n;
    const totalFiles = (this.db.prepare('SELECT COUNT(*) as n FROM files').get() as { n: number }).n;
    const scannedFiles = (
      this.db.prepare('SELECT COUNT(*) as n FROM files WHERE scanned_at IS NOT NULL').get() as { n: number }
    ).n;
    const errorFiles = (
      this.db.prepare('SELECT COUNT(*) as n FROM files WHERE scan_error IS NOT NULL').get() as { n: number }
    ).n;
    const jfEnriched = (
      this.db.prepare('SELECT COUNT(*) as n FROM movies WHERE jellyfin_id IS NOT NULL').get() as { n: number }
    ).n;
    const totalLibrarySize = (
      this.db.prepare('SELECT COALESCE(SUM(file_size), 0) as n FROM files WHERE scanned_at IS NOT NULL').get() as {
        n: number;
      }
    ).n;

    const resDist = this.db
      .prepare(
        'SELECT resolution_cat as cat, COUNT(*) as n FROM files WHERE scanned_at IS NOT NULL GROUP BY resolution_cat',
      )
      .all() as { cat: string; n: number }[];

    const codecDist = this.db
      .prepare(
        'SELECT video_codec as codec, COUNT(*) as n FROM files WHERE scanned_at IS NOT NULL GROUP BY video_codec ORDER BY n DESC',
      )
      .all() as { codec: string; n: number }[];
    const audioCodecDist = this.db
      .prepare(
        'SELECT audio_codec as codec, COUNT(*) as n FROM files WHERE scanned_at IS NOT NULL GROUP BY audio_codec ORDER BY n DESC',
      )
      .all() as { codec: string; n: number }[];

    const hdrCount = (
      this.db.prepare("SELECT COUNT(*) as n FROM files WHERE hdr_formats != '[]' AND scanned_at IS NOT NULL").get() as {
        n: number;
      }
    ).n;

    const dolbyVisionCount = (
      this.db
        .prepare("SELECT COUNT(*) as n FROM files WHERE hdr_formats LIKE '%DolbyVision%' AND scanned_at IS NOT NULL")
        .get() as { n: number }
    ).n;

    return {
      totalMovies,
      totalFiles,
      scannedFiles,
      errorFiles,
      jfEnriched,
      totalLibrarySize,
      resolutionDist: Object.fromEntries(resDist.map((r) => [r.cat ?? 'unknown', r.n])),
      codecDist: Object.fromEntries(codecDist.map((r) => [r.codec ?? 'unknown', r.n])),
      audioCodecDist: Object.fromEntries(audioCodecDist.map((r) => [r.codec ?? 'unknown', r.n])),
      hdrCount,
      dolbyVisionCount,
    };
  }

  /** Movies with low quality + high ratings — prime upgrade candidates */
  getUpgradeCandidates(
    opts: {
      search?: string;
      resolution?: string;
      codec?: string;
      audioFormat?: string;
      audioLayout?: string;
      hdrOnly?: boolean;
      dvOnly?: boolean;
      legacyOnly?: boolean;
      noJf?: boolean;
      multiOnly?: boolean;
      releaseGroups?: string[]; // e.g. ['YTS.MX', 'YTS', 'YIFY']
      genre?: string;
      genres?: string[];
      genreAnd?: boolean;
      tags?: string[];
      minCriticRating?: number; // Critic score, 0-100
      minCommunityRating?: number; // IMDb-style, 0-10
      limit?: number;
    } = {},
  ): UpgradeCandidate[] {
    let sql = `
      SELECT m.*,
             f.id as file_id,
             f.file_path as file_file_path,
             f.filename,
             f.resolution_cat, f.video_codec, f.audio_codec,
             f.file_size, f.mb_per_minute, f.release_group, f.hdr_formats
      FROM movies m
      LEFT JOIN files f ON f.movie_id = m.id
        AND f.id = (
          SELECT id FROM files f2 WHERE f2.movie_id = m.id
          ORDER BY f2.file_size DESC LIMIT 1
        )
      WHERE 1=1
    `;
    const bindings: (string | number)[] = [];

    if (opts.search) {
      sql += ' AND (m.parsed_title LIKE ? OR m.jellyfin_title LIKE ? OR m.folder_name LIKE ?)';
      const pat = `%${opts.search}%`;
      bindings.push(pat, pat, pat);
    }
    if (opts.resolution) {
      sql += ' AND f.resolution_cat = ?';
      bindings.push(opts.resolution);
    }
    if (opts.codec) {
      sql += ' AND f.video_codec = ?';
      bindings.push(opts.codec);
    }
    if (opts.hdrOnly) {
      sql += " AND f.hdr_formats != '[]'";
    }
    if (opts.dvOnly) {
      sql += " AND f.hdr_formats LIKE '%DolbyVision%'";
    }
    if (opts.legacyOnly) {
      sql += " AND COALESCE(f.video_codec,'') IN ('mpeg4','mpeg2video','msmpeg4v3')";
    }
    if (opts.audioLayout) {
      if (opts.audioLayout === 'stereo') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) = 'stereo' OR COALESCE(f.audio_channels, 0) = 2)";
      } else if (opts.audioLayout === '5.1') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) LIKE '%5.1%' OR COALESCE(f.audio_channels, 0) = 6)";
      } else if (opts.audioLayout === '7.1') {
        sql += " AND (LOWER(COALESCE(f.audio_layout,'')) LIKE '%7.1%' OR COALESCE(f.audio_channels, 0) = 8)";
      }
    }
    if (opts.audioFormat) {
      if (opts.audioFormat === 'ddp') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) = 'eac3' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%dolby digital plus%' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%ddp%')";
      } else if (opts.audioFormat === 'truehd') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) = 'truehd' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%truehd%')";
      } else if (opts.audioFormat === 'dts') {
        sql +=
          " AND (LOWER(COALESCE(f.audio_codec,'')) LIKE 'dts%' OR LOWER(COALESCE(f.audio_profile,'')) LIKE '%dts%')";
      } else if (opts.audioFormat === 'aac') {
        sql += " AND LOWER(COALESCE(f.audio_codec,'')) = 'aac'";
      } else if (opts.audioFormat === 'ac3') {
        sql += " AND LOWER(COALESCE(f.audio_codec,'')) = 'ac3'";
      } else if (opts.audioFormat === 'atmos') {
        sql += " AND LOWER(COALESCE(f.audio_profile,'')) LIKE '%atmos%'";
      }
    }
    if (opts.noJf) {
      sql += ' AND m.jellyfin_id IS NULL';
    }
    if (opts.multiOnly) {
      sql += ' AND (SELECT COUNT(*) FROM files mf WHERE mf.movie_id = m.id) > 1';
    }
    if (opts.releaseGroups && opts.releaseGroups.length > 0) {
      sql += ` AND f.release_group IN (${opts.releaseGroups.map(() => '?').join(',')})`;
      bindings.push(...opts.releaseGroups);
    }
    const genres = opts.genres && opts.genres.length > 0 ? opts.genres : opts.genre ? [opts.genre] : [];
    if (genres.length > 0) {
      if (opts.genreAnd) {
        for (const genre of genres) {
          sql += ` AND EXISTS (
            SELECT 1
            FROM json_each(COALESCE(m.genres, '[]')) g
            WHERE LOWER(CAST(g.value AS TEXT)) = ?
          )`;
          bindings.push(genre.toLowerCase());
        }
      } else {
        const placeholders = genres.map(() => '?').join(',');
        sql += ` AND EXISTS (
          SELECT 1
          FROM json_each(COALESCE(m.genres, '[]')) g
          WHERE LOWER(CAST(g.value AS TEXT)) IN (${placeholders})
        )`;
        bindings.push(...genres.map((g) => g.toLowerCase()));
      }
    }
    if (opts.tags && opts.tags.length > 0) {
      const placeholders = opts.tags.map(() => '?').join(',');
      sql += ` AND EXISTS (
        SELECT 1
        FROM json_each(COALESCE(m.tags, '[]')) t
        WHERE LOWER(CAST(t.value AS TEXT)) IN (${placeholders})
      )`;
      bindings.push(...opts.tags.map((tag) => tag.toLowerCase()));
    }
    if (opts.minCriticRating !== undefined) {
      sql += ' AND m.critic_rating >= ?';
      bindings.push(opts.minCriticRating);
    }
    if (opts.minCommunityRating !== undefined) {
      sql += ' AND m.community_rating >= ?';
      bindings.push(opts.minCommunityRating);
    }

    sql += ' ORDER BY m.critic_rating DESC, m.community_rating DESC';
    if (opts.limit) sql += ` LIMIT ${opts.limit}`;

    return this.db.prepare(sql).all(...bindings) as UpgradeCandidate[];
  }

  // ──────────────────────────────────────────────────────────────────
  // Scan runs
  // ──────────────────────────────────────────────────────────────────

  startScanRun(rootPath: string): number {
    const result = this.db
      .prepare("INSERT INTO scan_runs (started_at, root_path) VALUES (datetime('now'), ?)")
      .run(rootPath);
    return Number(result.lastInsertRowid);
  }

  finishScanRun(
    runId: number,
    stats: {
      totalFolders: number;
      totalFiles: number;
      scannedOk: number;
      scanErrors: number;
      durationSec: number;
      notes?: string;
    },
  ): void {
    this.db
      .prepare(`
      UPDATE scan_runs SET
        finished_at   = datetime('now'),
        total_folders = ?,
        total_files   = ?,
        scanned_ok    = ?,
        scan_errors   = ?,
        duration_sec  = ?,
        notes         = ?
      WHERE id = ?
    `)
      .run(
        stats.totalFolders,
        stats.totalFiles,
        stats.scannedOk,
        stats.scanErrors,
        stats.durationSec,
        stats.notes ?? null,
        runId,
      );
    this.pruneOldScanRuns(CuratDb.SCAN_HISTORY_MAX_RUNS);
  }

  getLastScanRun(): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1').get() as
      | Record<string, unknown>
      | undefined;
  }

  // ──────────────────────────────────────────────────────────────────
  // Settings
  // ──────────────────────────────────────────────────────────────────

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `)
      .run(key, value);
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  deleteSettings(keys: string[]): number {
    if (keys.length === 0) return 0;
    const placeholders = keys.map(() => '?').join(', ');
    const result = this.db.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(...keys);
    return result.changes;
  }

  // ──────────────────────────────────────────────────────────────────
  // Quality rules
  // ──────────────────────────────────────────────────────────────────

  getRules(category?: string): QualityRule[] {
    if (category) {
      return this.db
        .prepare('SELECT * FROM quality_rules WHERE category = ? ORDER BY priority ASC, id ASC')
        .all(category) as QualityRule[];
    }
    return this.db
      .prepare('SELECT * FROM quality_rules ORDER BY category ASC, priority ASC, id ASC')
      .all() as QualityRule[];
  }

  upsertRule(rule: QualityRuleUpsert): number {
    if (rule.id) {
      this.db
        .prepare(`
        UPDATE quality_rules SET
          category   = ?,
          name       = ?,
          enabled    = ?,
          priority   = ?,
          config     = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `)
        .run(
          rule.category,
          rule.name,
          rule.enabled ? 1 : 0,
          rule.priority ?? 0,
          typeof rule.config === 'string' ? rule.config : JSON.stringify(rule.config),
          rule.id,
        );
      return rule.id;
    }
    const result = this.db
      .prepare(`
      INSERT INTO quality_rules (category, name, enabled, priority, config)
      VALUES (?, ?, ?, ?, ?)
    `)
      .run(
        rule.category,
        rule.name,
        rule.enabled ? 1 : 0,
        rule.priority ?? 0,
        typeof rule.config === 'string' ? rule.config : JSON.stringify(rule.config),
      );
    return Number(result.lastInsertRowid);
  }

  deleteRule(id: number): boolean {
    const result = this.db.prepare('DELETE FROM quality_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteRulesByCategory(category: string): number {
    const result = this.db.prepare('DELETE FROM quality_rules WHERE category = ?').run(category);
    return result.changes;
  }

  reorderRules(category: string, ids: number[]): void {
    const update = this.db.prepare(
      "UPDATE quality_rules SET priority = ?, updated_at = datetime('now') WHERE id = ? AND category = ?",
    );
    const tx = this.db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, idx) => update.run(idx, id, category));
    });
    tx(ids);
  }

  // ──────────────────────────────────────────────────────────────────
  // Scan runs (read)
  // ──────────────────────────────────────────────────────────────────

  private pruneOldScanRuns(maxRuns = CuratDb.SCAN_HISTORY_MAX_RUNS): number {
    const max = Math.max(1, Math.floor(maxRuns));
    const result = this.db
      .prepare(`
      DELETE FROM scan_runs
      WHERE id NOT IN (
        SELECT id
        FROM scan_runs
        ORDER BY id DESC
        LIMIT ?
      )
    `)
      .run(max);
    return result.changes;
  }

  getScanRuns(limit = CuratDb.SCAN_HISTORY_MAX_RUNS): Record<string, unknown>[] {
    const safeLimit = Math.max(1, Math.min(CuratDb.SCAN_HISTORY_MAX_RUNS, Math.floor(limit)));
    return this.db.prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT ?').all(safeLimit) as Record<
      string,
      unknown
    >[];
  }

  // ──────────────────────────────────────────────────────────────────
  // Disambiguation log
  // ──────────────────────────────────────────────────────────────────

  logDisambiguationResult(result: import('../disambiguation/types.js').DisambiguateResult, jobId: string): void {
    this.db
      .prepare(`
      INSERT INTO disambiguation_log
        (job_id, request_id, input_title, input_year, method, confidence,
         matched_movie_id, ambiguous, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        jobId,
        result.requestId,
        result.requestId, // input_title filled by caller — requestId is the title here
        null,
        result.method,
        result.confidence,
        result.match?.movieId ?? null,
        result.ambiguous ? 1 : 0,
        result.ambiguousReason ?? null,
      );
  }

  logDisambiguationResultFull(
    result: import('../disambiguation/types.js').DisambiguateResult,
    jobId: string,
    inputTitle: string,
    inputYear?: number,
  ): void {
    this.db
      .prepare(`
      INSERT INTO disambiguation_log
        (job_id, request_id, input_title, input_year, method, confidence,
         matched_movie_id, ambiguous, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        jobId,
        result.requestId,
        inputTitle,
        inputYear ?? null,
        result.method,
        result.confidence,
        result.match?.movieId ?? null,
        result.ambiguous ? 1 : 0,
        result.ambiguousReason ?? null,
      );
  }

  getPendingDisambiguations(limit = 100): DisambiguationLogRow[] {
    return this.db
      .prepare('SELECT * FROM disambiguation_log WHERE reviewed = 0 ORDER BY id DESC LIMIT ?')
      .all(limit) as DisambiguationLogRow[];
  }

  getAmbiguousDisambiguations(limit = 100): DisambiguationLogRow[] {
    return this.db
      .prepare(`
      WITH latest AS (
        SELECT MAX(id) AS id
        FROM disambiguation_log
        WHERE reviewed = 0 AND ambiguous = 1
        GROUP BY
          COALESCE(matched_movie_id, -1),
          LOWER(COALESCE(input_title, '')),
          COALESCE(input_year, -1),
          LOWER(COALESCE(reason, ''))
      )
      SELECT dl.*,
             m.folder_name AS db_folder_name,
             m.folder_path AS db_folder_path,
             m.parsed_year AS db_parsed_year
      FROM   disambiguation_log dl
      JOIN   latest l ON l.id = dl.id
      LEFT JOIN movies m ON dl.matched_movie_id = m.id
      ORDER  BY dl.id DESC
      LIMIT  ?
    `)
      .all(limit) as DisambiguationLogRow[];
  }

  reviewDisambiguation(id: number, decision: 'confirm' | 'reject'): boolean {
    const val = decision === 'confirm' ? 1 : -1;
    const result = this.db.prepare('UPDATE disambiguation_log SET reviewed = ? WHERE id = ?').run(val, id);
    return result.changes > 0;
  }

  getDisambiguationCount(): { pending: number; total: number } {
    const pending = (
      this.db
        .prepare(
          `WITH latest AS (
         SELECT MAX(id) AS id
         FROM disambiguation_log
         WHERE reviewed = 0 AND ambiguous = 1
         GROUP BY
           COALESCE(matched_movie_id, -1),
           LOWER(COALESCE(input_title, '')),
           COALESCE(input_year, -1),
           LOWER(COALESCE(reason, ''))
       )
       SELECT COUNT(*) as n FROM latest`,
        )
        .get() as { n: number }
    ).n;
    const total = (this.db.prepare('SELECT COUNT(*) as n FROM disambiguation_log').get() as { n: number }).n;
    return { pending, total };
  }

  getUnmatchedMovies(limit = 200): UnmatchedMovieRow[] {
    return this.db
      .prepare(`
      SELECT id, folder_name, parsed_title, parsed_year, jellyfin_id
      FROM movies
      WHERE jellyfin_id IS NULL
        AND EXISTS (SELECT 1 FROM files f WHERE f.movie_id = movies.id)
      ORDER BY parsed_year DESC, folder_name ASC
      LIMIT ?
    `)
      .all(limit) as UnmatchedMovieRow[];
  }

  // ──────────────────────────────────────────────────────────────────
  // File verify
  // ──────────────────────────────────────────────────────────────────

  getUnverifiedFiles(limit = 500): FileRow[] {
    return this.db
      .prepare(
        `SELECT * FROM files
       WHERE scanned_at IS NOT NULL AND scan_error IS NULL
         AND (verify_status IS NULL OR verify_status = 'pending')
       ORDER BY id
       LIMIT ?`,
      )
      .all(limit) as FileRow[];
  }

  getUnverifiedCount(): number {
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) as n FROM files
       WHERE scanned_at IS NOT NULL AND scan_error IS NULL
         AND (verify_status IS NULL OR verify_status = 'pending')`,
        )
        .get() as { n: number }
    ).n;
  }

  setVerifyResult(
    fileId: number,
    result: {
      status: 'pass' | 'fail' | 'error';
      errors: string[];
      qualityFlags?: import('../scanner/deepcheck.js').QualityFlag[];
    },
  ): void {
    this.db
      .prepare(`
      UPDATE files SET
        verify_status  = ?,
        verify_errors  = ?,
        quality_flags  = ?,
        verified_at    = datetime('now'),
        updated_at     = datetime('now')
      WHERE id = ?
    `)
      .run(result.status, JSON.stringify(result.errors), JSON.stringify(result.qualityFlags ?? []), fileId);
  }

  getVerifyStats(): {
    unverified: number;
    pass: number;
    fail: number;
    error: number;
  } {
    const rows = this.db
      .prepare(
        `SELECT verify_status, COUNT(*) as n FROM files
       WHERE scanned_at IS NOT NULL
       GROUP BY verify_status`,
      )
      .all() as { verify_status: string | null; n: number }[];
    const stats = { unverified: 0, pass: 0, fail: 0, error: 0 };
    for (const r of rows) {
      if (r.verify_status === 'pass') stats.pass = r.n;
      else if (r.verify_status === 'fail') stats.fail = r.n;
      else if (r.verify_status === 'error') stats.error = r.n;
      else stats.unverified += r.n;
    }
    return stats;
  }

  getFailedVerifyFiles(limit = 200, offset = 0): FileRow[] {
    return this.db
      .prepare(`SELECT * FROM files WHERE verify_status = 'fail' ORDER BY verified_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as FileRow[];
  }

  getFailedVerifyCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) as n FROM files WHERE verify_status = 'fail'`).get() as { n: number }).n;
  }

  clearVerifyErrors(fileIds?: number[]): { cleared: number; clearedPending: number; clearedTotal: number } {
    let whereClause = 'WHERE verify_status IS NOT NULL';
    let bind: number[] = [];

    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const cleanIds = [...new Set(fileIds.filter((id) => Number.isInteger(id) && id > 0))];
      if (cleanIds.length === 0) return { cleared: 0, clearedPending: 0, clearedTotal: 0 };
      const placeholders = cleanIds.map(() => '?').join(',');
      whereClause = `${whereClause} AND id IN (${placeholders})`;
      bind = cleanIds;
    }

    const counts = this.db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN verify_status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
          SUM(CASE WHEN verify_status IN ('pass', 'fail', 'error') THEN 1 ELSE 0 END) AS completedCount
        FROM files
        ${whereClause}
      `,
      )
      .get(...bind) as { pendingCount: number | null; completedCount: number | null };

    const clearedPending = counts.pendingCount ?? 0;
    const cleared = counts.completedCount ?? 0;

    this.db
      .prepare(
        `
      UPDATE files
      SET verify_status = NULL,
          verify_errors = NULL,
          quality_flags = '[]',
          verified_at   = NULL,
          updated_at    = datetime('now')
      ${whereClause}
    `,
      )
      .run(...bind);

    return { cleared, clearedPending, clearedTotal: cleared + clearedPending };
  }

  resetPendingVerifyStatuses(): number {
    const stmt = this.db.prepare(`
      UPDATE files
      SET verify_status = NULL,
          verify_errors = NULL,
          quality_flags = '[]',
          verified_at   = NULL,
          updated_at    = datetime('now')
      WHERE verify_status = 'pending'
    `);
    return stmt.run().changes;
  }

  private reserveVerifyRows(rows: FileRow[]): void {
    if (rows.length === 0) return;
    const ids = rows.map((f) => f.id);
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(
        `
      UPDATE files SET
        verify_status = 'pending',
        verify_errors = NULL,
        quality_flags = '[]',
        verified_at   = NULL,
        updated_at    = datetime('now')
      WHERE id IN (${placeholders})
    `,
      )
      .run(...ids);
  }

  pickFilesForVerify(limit: number, rescan = false): FileRow[] {
    const tx = this.db.transaction((lim: number) => {
      const cond = rescan
        ? "WHERE scanned_at IS NOT NULL AND scan_error IS NULL AND verify_status != 'pending'"
        : 'WHERE scanned_at IS NOT NULL AND scan_error IS NULL AND verify_status IS NULL';
      const rows = this.db.prepare(`SELECT * FROM files ${cond} ORDER BY id LIMIT ?`).all(lim) as FileRow[];
      this.reserveVerifyRows(rows);
      return rows;
    });
    return tx(limit);
  }

  reserveVerifyFilesById(ids: number[]): FileRow[] {
    if (ids.length === 0) return [];
    const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (unique.length === 0) return [];
    const placeholders = unique.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM files WHERE id IN (${placeholders}) ORDER BY id`)
      .all(...unique) as FileRow[];
    this.reserveVerifyRows(rows);
    return rows;
  }

  close(): void {
    this.db.close();
  }

  /** Expose raw db for ad-hoc queries in tests */
  raw(): Database.Database {
    return this.db;
  }
}

export interface QualityRule {
  id: number;
  category: string;
  name: string;
  enabled: number;
  priority: number;
  config: string;
  created_at: string;
  updated_at: string;
}

export interface QualityRuleUpsert {
  id?: number;
  category: string;
  name: string;
  enabled: boolean;
  priority?: number;
  config: string | object;
}
