/**
 * Curatarr SQLite schema
 * All Jellyfin data is augmentation — never the source of truth for files.
 * ffprobe data is the authoritative record of what's actually on disk.
 */

import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 8;

export function applySchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );

    -- One row per movie folder (e.g. "Rashomon (1950)")
    CREATE TABLE IF NOT EXISTS movies (
      id              INTEGER PRIMARY KEY,
      folder_path     TEXT UNIQUE NOT NULL,   -- absolute path to movie folder
      folder_name     TEXT NOT NULL,          -- basename of folder
      parsed_title    TEXT,                   -- title parsed from folder name
      parsed_year     INTEGER,                -- year parsed from folder name

      -- Jellyfin enrichment (nullable — populated by jf-sync)
      jellyfin_id     TEXT,
      jellyfin_title  TEXT,
      jellyfin_year   INTEGER,
      imdb_id         TEXT,
      tmdb_id         TEXT,
      critic_rating   REAL,                   -- Metacritic 0-100
      community_rating REAL,                  -- IMDb/community 0-10
      genres          TEXT,                   -- JSON array of strings
      overview        TEXT,
      jellyfin_path   TEXT,                   -- path Jellyfin knows about

      -- Sync metadata
      jf_synced_at    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_movies_jellyfin_id ON movies(jellyfin_id);
    CREATE INDEX IF NOT EXISTS idx_movies_imdb_id     ON movies(imdb_id);
    CREATE INDEX IF NOT EXISTS idx_movies_parsed_year ON movies(parsed_year);

    -- One row per video file found in a movie folder
    CREATE TABLE IF NOT EXISTS files (
      id              INTEGER PRIMARY KEY,
      movie_id        INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      file_path       TEXT UNIQUE NOT NULL,   -- absolute path to file
      filename        TEXT NOT NULL,

      -- Video
      resolution      TEXT,                   -- "3840x2076"
      resolution_cat  TEXT,                   -- "480p"|"720p"|"1080p"|"2160p"|"other"
      width           INTEGER,
      height          INTEGER,
      video_codec     TEXT,                   -- "hevc"|"h264"|"av1"|"mpeg2video" etc
      video_bitrate   INTEGER,                -- kbps
      bit_depth       INTEGER,                -- 8|10|12
      frame_rate      REAL,                   -- fps, e.g. 23.976
      color_transfer  TEXT,                   -- "smpte2084"|"arib-std-b67"|"bt709"
      color_primaries TEXT,

      -- HDR — stored as JSON array: ["HDR10","DolbyVision"]
      hdr_formats     TEXT NOT NULL DEFAULT '[]',
      dv_profile      INTEGER,                -- 5|7|8 or null

      -- Audio (primary track)
      audio_codec     TEXT,
      audio_profile   TEXT,                   -- "TrueHD + Atmos"|"DTS-HD MA" etc
      audio_channels  INTEGER,
      audio_layout    TEXT,                   -- "5.1"|"7.1"|"stereo"
      audio_bitrate   INTEGER,                -- kbps (0 = lossless)
      -- All audio tracks JSON: [{codec,channels,language,isDefault,...}]
      audio_tracks    TEXT NOT NULL DEFAULT '[]',

      -- Subtitle track languages JSON: ["eng","fre"]
      subtitle_langs  TEXT NOT NULL DEFAULT '[]',

      -- File
      file_size       INTEGER,                -- bytes
      duration        REAL,                   -- seconds
      container       TEXT,                   -- "mkv"|"mp4"|"avi"
      mb_per_minute   REAL,                   -- file_size_MB / duration_min

      -- Release group parsed from filename
      release_group   TEXT,

      -- Raw ffprobe output (full JSON for reprocessing)
      ffprobe_raw     TEXT,

      -- Scan status
      scanned_at      TEXT,
      scan_error      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_files_movie_id       ON files(movie_id);
    CREATE INDEX IF NOT EXISTS idx_files_resolution_cat ON files(resolution_cat);
    CREATE INDEX IF NOT EXISTS idx_files_video_codec    ON files(video_codec);
    CREATE INDEX IF NOT EXISTS idx_files_release_group  ON files(release_group);
    CREATE INDEX IF NOT EXISTS idx_files_scanned_at     ON files(scanned_at);

    -- Scan session log
    CREATE TABLE IF NOT EXISTS scan_runs (
      id            INTEGER PRIMARY KEY,
      started_at    TEXT NOT NULL,
      finished_at   TEXT,
      root_path     TEXT NOT NULL,
      total_folders INTEGER,
      total_files   INTEGER,
      scanned_ok    INTEGER,
      scan_errors   INTEGER,
      duration_sec  REAL,
      notes         TEXT
    );

    -- Key-value store for connection settings
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Configurable quality rules
    CREATE TABLE IF NOT EXISTS quality_rules (
      id         INTEGER PRIMARY KEY,
      category   TEXT NOT NULL,   -- 'profiles' | 'groups' | 'scoring' | 'scout'
      name       TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      priority   INTEGER NOT NULL DEFAULT 0,
      config     TEXT NOT NULL,   -- JSON blob
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_quality_rules_category ON quality_rules(category);

    -- Disambiguation audit log
    CREATE TABLE IF NOT EXISTS disambiguation_log (
      id               INTEGER PRIMARY KEY,
      job_id           TEXT NOT NULL,
      request_id       TEXT NOT NULL,
      input_title      TEXT NOT NULL,
      input_year       INTEGER,
      method           TEXT,
      confidence       REAL,
      matched_movie_id INTEGER REFERENCES movies(id),
      ambiguous        INTEGER NOT NULL DEFAULT 0,
      reason           TEXT,
      reviewed         INTEGER NOT NULL DEFAULT 0,  -- 0=pending 1=confirmed -1=rejected
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dis_log_job     ON disambiguation_log(job_id);
    CREATE INDEX IF NOT EXISTS idx_dis_log_pending ON disambiguation_log(reviewed) WHERE reviewed = 0;
  `);

  // ── Schema migrations (ALTER TABLE for existing DBs) ───────────────

  // v6: user-editable tags and notes on movies
  const moviesCols = (db.pragma('table_info(movies)') as { name: string }[]).map(c => c.name);
  if (!moviesCols.includes('tags')) {
    db.exec(`ALTER TABLE movies ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!moviesCols.includes('notes')) {
    db.exec(`ALTER TABLE movies ADD COLUMN notes TEXT`);
  }

  const filesCols = (db.pragma('table_info(files)') as { name: string }[]).map(c => c.name);
  if (!filesCols.includes('verify_status')) {
    db.exec(`ALTER TABLE files ADD COLUMN verify_status TEXT`);
  }
  if (!filesCols.includes('verify_errors')) {
    db.exec(`ALTER TABLE files ADD COLUMN verify_errors TEXT`);
  }
  if (!filesCols.includes('verified_at')) {
    db.exec(`ALTER TABLE files ADD COLUMN verified_at TEXT`);
  }

  // v8: quality analytics flags per file
  if (!filesCols.includes('quality_flags')) {
    db.exec(`ALTER TABLE files ADD COLUMN quality_flags TEXT NOT NULL DEFAULT '[]'`);
  }

  // v7: reclassify resolution_cat using corrected widescreen thresholds.
  // Fixes scope films (e.g. 1916×796) incorrectly classified as 720p.
  // Runs once, tracked in settings table.
  const resFixed = db.prepare(
    "SELECT value FROM settings WHERE key = 'resolution_cat_v7'"
  ).get();
  if (!resFixed) {
    db.exec(`
      UPDATE files SET resolution_cat = CASE
        WHEN (height >= 2160 OR width >= 3800) THEN '2160p'
        WHEN (height >= 1080 OR width >= 1880) THEN '1080p'
        WHEN (height >= 720  OR width >= 1240) THEN '720p'
        WHEN height > 0                        THEN '480p'
        ELSE 'other'
      END
      WHERE width IS NOT NULL AND height IS NOT NULL
    `);
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('resolution_cat_v7', '1', datetime('now'))"
    ).run();
  }

  // Stamp version
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  if (!row) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (row.version < SCHEMA_VERSION) {
    db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }
}
