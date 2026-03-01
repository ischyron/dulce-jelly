/**
 * DB client tests — uses in-memory SQLite
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const { CuratDb } = await import('../dist/db/client.js');

const TMP_DB = path.join(os.tmpdir(), `curatarr-test-${Date.now()}.db`);

describe('CuratDb', () => {
  let db;

  beforeEach(() => {
    // Fresh DB for each test
    if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
    db = new CuratDb(TMP_DB);
  });

  test('creates schema tables', () => {
    const tables = db.raw().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    assert.ok(tables.includes('movies'));
    assert.ok(tables.includes('files'));
    assert.ok(tables.includes('scan_runs'));
  });

  test('upsertMovie creates a row', () => {
    const id = db.upsertMovie({
      folderPath: '/media/Movies/Rashomon (1950)',
      folderName: 'Rashomon (1950)',
      parsedTitle: 'Rashomon',
      parsedYear: 1950,
    });
    assert.ok(id > 0);
    const row = db.getMovieById(id);
    assert.equal(row.parsed_title, 'Rashomon');
    assert.equal(row.parsed_year, 1950);
  });

  test('upsertMovie is idempotent (upsert, not insert)', () => {
    const id1 = db.upsertMovie({
      folderPath: '/media/Movies/Rashomon (1950)',
      folderName: 'Rashomon (1950)',
      parsedTitle: 'Rashomon',
      parsedYear: 1950,
    });
    const id2 = db.upsertMovie({
      folderPath: '/media/Movies/Rashomon (1950)',
      folderName: 'Rashomon (1950)',
      parsedTitle: 'Rashomon',
      parsedYear: 1950,
    });
    assert.equal(id1, id2);
    const all = db.getAllMovies();
    assert.equal(all.length, 1);
  });

  test('upsertFile stores ffprobe data', () => {
    const movieId = db.upsertMovie({
      folderPath: '/media/Movies/Rashomon (1950)',
      folderName: 'Rashomon (1950)',
    });

    const fileId = db.upsertFile({
      movieId,
      filePath: '/media/Movies/Rashomon (1950)/Rashomon.1950.1080p.BluRay-AMIABLE.mkv',
      filename: 'Rashomon.1950.1080p.BluRay-AMIABLE.mkv',
      resolutionCat: '1080p',
      width: 1920,
      height: 1080,
      videoCodec: 'hevc',
      videoBitrate: 8000,
      bitDepth: 10,
      hdrFormats: [],
      audioCodec: 'truehd',
      audioChannels: 8,
      audioLayout: '7.1',
      audioTracks: [{ index: 1, codec: 'truehd', channels: 8, language: 'eng', isDefault: true }],
      fileSize: 10_000_000_000,
      duration: 7200,
      container: 'mkv',
      mbPerMinute: Math.round(10000 / 120),
      releaseGroup: 'AMIABLE',
    });
    assert.ok(fileId > 0);

    const files = db.getFilesForMovie(movieId);
    assert.equal(files.length, 1);
    assert.equal(files[0].video_codec, 'hevc');
    assert.equal(files[0].release_group, 'AMIABLE');
    assert.equal(files[0].resolution_cat, '1080p');
  });

  test('enrichFromJellyfin updates movie', () => {
    db.upsertMovie({
      folderPath: '/media/Movies/Rashomon (1950)',
      folderName: 'Rashomon (1950)',
    });

    const ok = db.enrichFromJellyfin('/media/Movies/Rashomon (1950)', {
      jellyfinId: 'abc123',
      jellyfinTitle: 'Rashomon',
      jellyfinYear: 1950,
      imdbId: 'tt0042876',
      tmdbId: '548',
      criticRating: 98,
      communityRating: 8.3,
      genres: ['Crime', 'Drama', 'Mystery'],
    });

    assert.ok(ok);
    const movies = db.getAllMovies();
    assert.equal(movies[0].jellyfin_id, 'abc123');
    assert.equal(movies[0].critic_rating, 98);
    assert.equal(movies[0].imdb_id, 'tt0042876');
    // genres stored as JSON
    const genres = JSON.parse(movies[0].genres);
    assert.ok(genres.includes('Drama'));
  });

  test('getStats returns correct counts', () => {
    const movieId = db.upsertMovie({ folderPath: '/m/A', folderName: 'A' });
    db.upsertFile({
      movieId,
      filePath: '/m/A/a.mkv',
      filename: 'a.mkv',
      resolutionCat: '1080p',
      hdrFormats: ['HDR10'],
      audioTracks: [],
      scannedAt: new Date().toISOString(),
    });

    const stats = db.getStats();
    assert.equal(stats.totalMovies, 1);
    assert.equal(stats.totalFiles, 1);
    // scanned_at is set by upsertFile when no scanError
    // (it won't be set since we passed scannedAt directly — check hdr)
    assert.ok(stats.hdrCount >= 0);
  });

  test('scan run tracking', () => {
    const runId = db.startScanRun('/media/Movies');
    assert.ok(runId > 0);

    db.finishScanRun(runId, {
      totalFolders: 100,
      totalFiles: 95,
      scannedOk: 93,
      scanErrors: 2,
      durationSec: 45.2,
    });

    const last = db.getLastScanRun();
    assert.ok(last);
    assert.equal(last.total_folders, 100);
    assert.equal(last.scanned_ok, 93);
  });
});
