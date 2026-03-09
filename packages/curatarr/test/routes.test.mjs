import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CuratDb } from '../src/server/dist/db/client.js';
import { createApp } from '../src/server/dist/server/app.js';
import { verifyEmitter } from '../src/server/dist/server/sse.js';

async function makeTempDir(label) {
  return fs.mkdtemp(path.join(os.tmpdir(), `curatarr-${label}-`));
}

function makeApp(db) {
  // dist path can be missing in tests; API routes still mount.
  return createApp(db, path.join(process.cwd(), 'src/ui/dist'));
}

function jsonResponse(body, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

test('scan rejects when library roots are missing', async (t) => {
  const tmp = await makeTempDir('scan-missing');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const res = await app.request('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.match(body.error, /Library root folders not configured/i);
});

test('scan rejects paths outside configured movie roots', async (t) => {
  const tmp = await makeTempDir('scan-outside');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const libraryRoot = path.join(tmp, 'library');
  const outside = path.join(tmp, 'outside');
  await fs.mkdir(libraryRoot, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  db.setSetting('libraryRoots', JSON.stringify([{ type: 'movies', path: libraryRoot }]));

  const res = await app.request('http://localhost/api/scan', {
    method: 'POST',
    body: JSON.stringify({ path: outside }),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.match(body.error, /outside configured library roots/i);
});

test('movies delete blocks symlinked folders even within roots', async (t) => {
  const tmp = await makeTempDir('movies-symlink');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const libraryRoot = path.join(tmp, 'library');
  const target = path.join(libraryRoot, 'MovieA');
  const symlinked = path.join(libraryRoot, 'MovieLink');
  await fs.mkdir(target, { recursive: true });
  await fs.mkdir(libraryRoot, { recursive: true });
  await fs.symlink(target, symlinked);
  db.setSetting('libraryRoots', JSON.stringify([{ type: 'movies', path: libraryRoot }]));
  const movieId = db.upsertMovie({ folderPath: symlinked, folderName: 'MovieLink' });

  const res = await app.request(`http://localhost/api/movies/${movieId}`, {
    method: 'DELETE',
    body: JSON.stringify({ mode: 'folder' }),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'forbidden_path');
  assert.match(body.detail, /symlink/i);
});

test('settings validation rejects invalid libraryRoots and numeric bounds', async (t) => {
  const tmp = await makeTempDir('settings-validate');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const badRoots = await app.request('http://localhost/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ libraryRoots: 'not-json' }),
    headers: { 'content-type': 'application/json' },
  });
  const badRootsBody = await badRoots.json();
  assert.equal(badRoots.status, 400);
  assert.match(badRootsBody.error, /valid JSON array/i);

  const badNumber = await app.request('http://localhost/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ jfSyncIntervalMin: '-5' }),
    headers: { 'content-type': 'application/json' },
  });
  const badNumberBody = await badNumber.json();
  assert.equal(badNumber.status, 400);
  assert.match(badNumberBody.error, /between 0 and 1440/);
});

test('movies listing returns filtered totalSize for full result set, not current page', async (t) => {
  const tmp = await makeTempDir('movies-total-size');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const movieA = db.upsertMovie({ folderPath: '/m/A', folderName: 'A' });
  db.upsertFile({
    movieId: movieA,
    filePath: '/m/A/a-1080p.mkv',
    filename: 'a-1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });

  const movieB = db.upsertMovie({ folderPath: '/m/B', folderName: 'B' });
  db.upsertFile({
    movieId: movieB,
    filePath: '/m/B/b-4k.mkv',
    filename: 'b-4k.mkv',
    resolutionCat: '2160p',
    videoCodec: 'h264',
    fileSize: 200,
    hdrFormats: [],
    audioTracks: [],
  });

  const movieC = db.upsertMovie({ folderPath: '/m/C', folderName: 'C' });
  db.upsertFile({
    movieId: movieC,
    filePath: '/m/C/c-4k.mkv',
    filename: 'c-4k.mkv',
    resolutionCat: '2160p',
    videoCodec: 'hevc',
    fileSize: 300,
    hdrFormats: [],
    audioTracks: [],
  });

  const filtered = await app.request('http://localhost/api/movies?codec=h264&page=1&limit=1');
  assert.equal(filtered.status, 200);
  const filteredBody = await filtered.json();
  assert.equal(filteredBody.total, 2);
  assert.equal(filteredBody.movies.length, 1);
  assert.equal(filteredBody.totalSize, 300);

  const unfiltered = await app.request('http://localhost/api/movies?page=1&limit=1');
  assert.equal(unfiltered.status, 200);
  const unfilteredBody = await unfiltered.json();
  assert.equal(unfilteredBody.total, 3);
  assert.equal(unfilteredBody.movies.length, 1);
  assert.equal(unfilteredBody.totalSize, 600);
});

test('movies genre filter supports OR default and AND mode', async (t) => {
  const tmp = await makeTempDir('movies-genre-and-or');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const bothId = db.upsertMovie({
    folderPath: '/m/Both',
    folderName: 'Both (2020)',
    parsedTitle: 'Both',
    parsedYear: 2020,
  });
  db.enrichMovieById(bothId, { genres: ['Action', 'Drama'] });
  db.upsertFile({
    movieId: bothId,
    filePath: '/m/Both/both.mkv',
    filename: 'Both.2020.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });

  const actionOnlyId = db.upsertMovie({
    folderPath: '/m/ActionOnly',
    folderName: 'ActionOnly (2021)',
    parsedTitle: 'ActionOnly',
    parsedYear: 2021,
  });
  db.enrichMovieById(actionOnlyId, { genres: ['Action'] });
  db.upsertFile({
    movieId: actionOnlyId,
    filePath: '/m/ActionOnly/action.mkv',
    filename: 'ActionOnly.2021.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 110,
    hdrFormats: [],
    audioTracks: [],
  });

  const dramaOnlyId = db.upsertMovie({
    folderPath: '/m/DramaOnly',
    folderName: 'DramaOnly (2022)',
    parsedTitle: 'DramaOnly',
    parsedYear: 2022,
  });
  db.enrichMovieById(dramaOnlyId, { genres: ['Drama'] });
  db.upsertFile({
    movieId: dramaOnlyId,
    filePath: '/m/DramaOnly/drama.mkv',
    filename: 'DramaOnly.2022.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 120,
    hdrFormats: [],
    audioTracks: [],
  });

  const orRes = await app.request('http://localhost/api/movies?genre=Action,Drama&page=1&limit=50');
  assert.equal(orRes.status, 200);
  const orBody = await orRes.json();
  assert.equal(orBody.total, 3);

  const andRes = await app.request('http://localhost/api/movies?genre=Action,Drama&genreAnd=1&page=1&limit=50');
  assert.equal(andRes.status, 200);
  const andBody = await andRes.json();
  assert.equal(andBody.total, 1);
  assert.equal(andBody.movies[0].id, bothId);
});

test('candidates total reflects filtered result set before limit', async (t) => {
  const tmp = await makeTempDir('candidates-total-before-limit');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const movieA = db.upsertMovie({ folderPath: '/m/A', folderName: 'A (2020)', parsedTitle: 'A', parsedYear: 2020 });
  db.enrichMovieById(movieA, { criticRating: 80, communityRating: 7.8 });
  db.upsertFile({
    movieId: movieA,
    filePath: '/m/A/a-1080.mkv',
    filename: 'A.2020.1080p.BluRay.x264-GRP.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });

  const movieB = db.upsertMovie({ folderPath: '/m/B', folderName: 'B (2021)', parsedTitle: 'B', parsedYear: 2021 });
  db.enrichMovieById(movieB, { criticRating: 85, communityRating: 8.0 });
  db.upsertFile({
    movieId: movieB,
    filePath: '/m/B/b-1080.mkv',
    filename: 'B.2021.1080p.BluRay.x264-GRP.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 110,
    hdrFormats: [],
    audioTracks: [],
  });

  const movieC = db.upsertMovie({ folderPath: '/m/C', folderName: 'C (2022)', parsedTitle: 'C', parsedYear: 2022 });
  db.enrichMovieById(movieC, { criticRating: 90, communityRating: 8.2 });
  db.upsertFile({
    movieId: movieC,
    filePath: '/m/C/c-2160.mkv',
    filename: 'C.2022.2160p.BluRay.x265-GRP.mkv',
    resolutionCat: '2160p',
    videoCodec: 'hevc',
    fileSize: 220,
    hdrFormats: [],
    audioTracks: [],
  });

  const res = await app.request(
    'http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&resolution=1080p&limit=1',
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 2);
  assert.equal(body.candidates.length, 1);

  const allRes = await app.request(
    'http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&resolution=1080p&limit=1&all=1',
  );
  assert.equal(allRes.status, 200);
  const allBody = await allRes.json();
  assert.equal(allBody.total, 2);
  assert.equal(allBody.candidates.length, 2);
});

test('candidates uses one primary file per movie and falls back release group from filename', async (t) => {
  const tmp = await makeTempDir('candidates-release-group');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const movieId = db.upsertMovie({ folderPath: '/m/A', folderName: 'A (2020)', parsedTitle: 'A', parsedYear: 2020 });
  db.enrichMovieById(movieId, { criticRating: 80, communityRating: 7.5 });

  db.upsertFile({
    movieId,
    filePath: '/m/A/a-small.mkv',
    filename: 'A.2020.720p.BluRay.x264-GROUPA.mkv',
    resolutionCat: '720p',
    videoCodec: 'h264',
    releaseGroup: 'GROUPA',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });
  db.upsertFile({
    movieId,
    filePath: '/m/A/a-big.mkv',
    filename: 'A.2020.1080p.BluRay.x264.YIFY.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    releaseGroup: undefined,
    fileSize: 300,
    hdrFormats: [],
    audioTracks: [],
  });

  const res = await app.request('http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&limit=20');
  assert.equal(res.status, 200);
  const body = await res.json();
  const rows = body.candidates.filter((row) => row.id === movieId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].release_group, 'YIFY');
});

test('candidates applies library-equivalent filters for tags, codec, hdr, noJf and search', async (t) => {
  const tmp = await makeTempDir('candidates-filters');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const keepId = db.upsertMovie({
    folderPath: '/m/Keep',
    folderName: 'Keep Me (2021)',
    parsedTitle: 'Keep Me',
    parsedYear: 2021,
  });
  db.updateMovieMeta(keepId, { tags: ['keep'] });
  db.enrichMovieById(keepId, { criticRating: 74, communityRating: 7.2 });
  db.upsertFile({
    movieId: keepId,
    filePath: '/m/Keep/keep.mkv',
    filename: 'Keep.Me.2021.2160p.WEB-DL.AV1.DDP5.1-GRP.mkv',
    resolutionCat: '2160p',
    videoCodec: 'av1',
    hdrFormats: ['HDR10'],
    fileSize: 500,
    audioTracks: [],
  });

  const dropId = db.upsertMovie({
    folderPath: '/m/Drop',
    folderName: 'Drop Me (2020)',
    parsedTitle: 'Drop Me',
    parsedYear: 2020,
  });
  db.updateMovieMeta(dropId, { tags: ['skip'] });
  db.enrichMovieById(dropId, { jellyfinId: 'jf-1', criticRating: 91, communityRating: 8.8 });
  db.upsertFile({
    movieId: dropId,
    filePath: '/m/Drop/drop.mkv',
    filename: 'Drop.Me.2020.2160p.WEB-DL.AV1.DDP5.1-GRP.mkv',
    resolutionCat: '2160p',
    videoCodec: 'av1',
    hdrFormats: ['HDR10'],
    fileSize: 600,
    audioTracks: [],
  });

  const res = await app.request(
    'http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&search=Keep&codec=av1&hdr=true&noJf=true&tags=keep&limit=20',
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.equal(body.candidates[0].id, keepId);
});

test('candidates genre filter supports OR default and AND mode', async (t) => {
  const tmp = await makeTempDir('candidates-genre-and-or');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const bothId = db.upsertMovie({
    folderPath: '/m/Both',
    folderName: 'Both (2020)',
    parsedTitle: 'Both',
    parsedYear: 2020,
  });
  db.enrichMovieById(bothId, { criticRating: 80, communityRating: 7.8, genres: ['Action', 'Drama'] });
  db.upsertFile({
    movieId: bothId,
    filePath: '/m/Both/both.mkv',
    filename: 'Both.2020.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });

  const actionOnlyId = db.upsertMovie({
    folderPath: '/m/ActionOnly',
    folderName: 'ActionOnly (2021)',
    parsedTitle: 'ActionOnly',
    parsedYear: 2021,
  });
  db.enrichMovieById(actionOnlyId, { criticRating: 82, communityRating: 7.6, genres: ['Action'] });
  db.upsertFile({
    movieId: actionOnlyId,
    filePath: '/m/ActionOnly/action.mkv',
    filename: 'ActionOnly.2021.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 110,
    hdrFormats: [],
    audioTracks: [],
  });

  const dramaOnlyId = db.upsertMovie({
    folderPath: '/m/DramaOnly',
    folderName: 'DramaOnly (2022)',
    parsedTitle: 'DramaOnly',
    parsedYear: 2022,
  });
  db.enrichMovieById(dramaOnlyId, { criticRating: 84, communityRating: 7.5, genres: ['Drama'] });
  db.upsertFile({
    movieId: dramaOnlyId,
    filePath: '/m/DramaOnly/drama.mkv',
    filename: 'DramaOnly.2022.1080p.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 120,
    hdrFormats: [],
    audioTracks: [],
  });

  const orRes = await app.request(
    'http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&genre=Action,Drama&limit=20',
  );
  assert.equal(orRes.status, 200);
  const orBody = await orRes.json();
  assert.equal(orBody.total, 3);

  const andRes = await app.request(
    'http://localhost/api/candidates?criticScoreMin=0&imdbScoreMin=0&genre=Action,Drama&genreAnd=1&limit=20',
  );
  assert.equal(andRes.status, 200);
  const andBody = await andRes.json();
  assert.equal(andBody.total, 1);
  assert.equal(andBody.candidates[0].id, bothId);
});

test('verify start returns 409 when a verify job is already running', async (t) => {
  const tmp = await makeTempDir('verify-running');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  verifyEmitter.start(); // simulate an in-flight verify job
  t.after(() => verifyEmitter.finish());

  const res = await app.request('http://localhost/api/verify/start', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.match(body.error, /Verify already running/i);
});

test('verify clear resets all verify result rows including pass', async (t) => {
  const tmp = await makeTempDir('verify-clear');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const movieId = db.upsertMovie({
    folderPath: '/m/VerifyTarget',
    folderName: 'VerifyTarget (2020)',
    parsedTitle: 'VerifyTarget',
    parsedYear: 2020,
  });

  const failFileId = db.upsertFile({
    movieId,
    filePath: '/m/VerifyTarget/fail.mkv',
    filename: 'fail.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });
  const errorFileId = db.upsertFile({
    movieId,
    filePath: '/m/VerifyTarget/error.mkv',
    filename: 'error.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });
  const passFileId = db.upsertFile({
    movieId,
    filePath: '/m/VerifyTarget/pass.mkv',
    filename: 'pass.mkv',
    resolutionCat: '1080p',
    videoCodec: 'h264',
    fileSize: 100,
    hdrFormats: [],
    audioTracks: [],
  });

  db.setVerifyResult(failFileId, {
    status: 'fail',
    errors: ['Invalid NAL unit size'],
    qualityFlags: [{ severity: 'FLAG', code: 'decode_error', message: 'decode error' }],
  });
  db.setVerifyResult(errorFileId, {
    status: 'error',
    errors: ['spawn error: ffmpeg missing'],
    qualityFlags: [{ severity: 'FLAG', code: 'mux_error', message: 'mux error' }],
  });
  db.setVerifyResult(passFileId, { status: 'pass', errors: [], qualityFlags: [] });

  const res = await app.request('http://localhost/api/verify/clear', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.cleared, 3);

  const rows = db.getAllFiles();
  const failRow = rows.find((r) => r.id === failFileId);
  const errorRow = rows.find((r) => r.id === errorFileId);
  const passRow = rows.find((r) => r.id === passFileId);
  assert.ok(failRow);
  assert.ok(errorRow);
  assert.ok(passRow);

  assert.equal(failRow.verify_status, null);
  assert.equal(failRow.verify_errors, null);
  assert.equal(failRow.quality_flags, '[]');

  assert.equal(errorRow.verify_status, null);
  assert.equal(errorRow.verify_errors, null);
  assert.equal(errorRow.quality_flags, '[]');

  assert.equal(passRow.verify_status, null);
  assert.equal(passRow.verify_errors, null);
  assert.equal(passRow.quality_flags, '[]');
});

test('jf-refresh falls back to title/year search when stored Jellyfin ID lookup returns 400', async (t) => {
  const tmp = await makeTempDir('jf-refresh-fallback');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  db.setSetting('jellyfinUrl', 'http://jellyfin:8096');
  db.setSetting('jellyfinApiKey', 'test-key');

  const movieId = db.upsertMovie({
    folderPath: '/media/Movies/First Blood (1982)',
    folderName: 'First Blood (1982)',
    parsedTitle: 'First Blood',
    parsedYear: 1982,
  });
  db.enrichMovieById(movieId, {
    jellyfinId: '946c62f99e01c0b5fcf16d98937820f1',
    jellyfinTitle: 'First Blood',
    jellyfinYear: 1982,
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const ids = u.searchParams.get('Ids');
    const searchTerm = u.searchParams.get('SearchTerm');

    if (u.pathname === '/Items' && ids === '946c62f99e01c0b5fcf16d98937820f1') {
      return new Response('Error processing request.', { status: 400, statusText: 'Bad Request' });
    }
    if (u.pathname === '/Items' && searchTerm === 'First Blood') {
      return jsonResponse({
        Items: [
          {
            Id: 'new-jf-id-1',
            Name: 'First Blood',
            ProductionYear: 1982,
            Path: '/media/Movies/First Blood (1982)/First.Blood.1982.mkv',
            ProviderIds: { Imdb: 'tt0083944', Tmdb: '1368' },
            CriticRating: 86,
            CommunityRating: 7.7,
            Genres: ['Action'],
            Overview: 'desc',
          },
        ],
      });
    }
    throw new Error(`unexpected fetch url in test: ${String(url)}`);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const res = await app.request(`http://localhost/api/movies/${movieId}/jf-refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.updated, true);
  assert.equal(body.movie.jellyfin_id, 'new-jf-id-1');
});

test('jf-refresh returns disambiguation_required when ID lookup fails and fallback finds no candidates', async (t) => {
  const tmp = await makeTempDir('jf-refresh-no-match');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  db.setSetting('jellyfinUrl', 'http://jellyfin:8096');
  db.setSetting('jellyfinApiKey', 'test-key');

  const movieId = db.upsertMovie({
    folderPath: '/media/Movies/No Match Movie (2001)',
    folderName: 'No Match Movie (2001)',
    parsedTitle: 'No Match Movie',
    parsedYear: 2001,
  });
  db.enrichMovieById(movieId, {
    jellyfinId: 'stale-jf-id',
    jellyfinTitle: 'No Match Movie',
    jellyfinYear: 2001,
  });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const ids = u.searchParams.get('Ids');
    const searchTerm = u.searchParams.get('SearchTerm');
    if (u.pathname === '/Items' && ids === 'stale-jf-id') {
      return new Response('Error processing request.', { status: 400, statusText: 'Bad Request' });
    }
    if (u.pathname === '/Items' && searchTerm === 'No Match Movie') {
      return jsonResponse({ Items: [] });
    }
    throw new Error(`unexpected fetch url in test: ${String(url)}`);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const res = await app.request(`http://localhost/api/movies/${movieId}/jf-refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.error, 'disambiguation_required');
});

test('scout send-to-sab rejects when prowlarr is not configured', async (t) => {
  const tmp = await makeTempDir('scout-send-no-prowlarr');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  const res = await app.request('http://localhost/api/scout/send-to-sab', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Toy Story 1995',
      protocol: 'usenet',
      downloadUrl: 'http://prowlarr:9696/prowlarr/12/download?apikey=test&link=abc',
    }),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.error, 'prowlarr_not_configured');
});

test('scout send-to-sab submits NZB to SABnzbd via addurl', async (t) => {
  const tmp = await makeTempDir('scout-send-sab-addurl');
  t.after(async () => fs.rm(tmp, { recursive: true, force: true }));
  const db = new CuratDb(path.join(tmp, 'curatarr.db'));
  const app = makeApp(db);

  db.setSetting('prowlarrUrl', 'http://prowlarr:9696/prowlarr');
  db.setSetting('prowlarrApiKey', 'test-prowlarr-key');
  db.setSetting('sabUrl', 'http://sabnzbd:8080');
  db.setSetting('sabApiKey', 'test-sab-key');

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (u.hostname === 'sabnzbd' && u.pathname === '/api') {
      const body = new URLSearchParams(await (init?.body ? Promise.resolve(init.body) : Promise.resolve('')));
      assert.equal(body.get('mode'), 'addurl');
      assert.ok(body.get('name')?.includes('prowlarr'));
      assert.equal(body.get('apikey'), 'test-sab-key');
      return new Response(JSON.stringify({ status: true, nzo_ids: ['SABnzbd_nzo_abc123'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch url in test: ${String(url)}`);
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const res = await app.request('http://localhost/api/scout/send-to-sab', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Toy Story 1995',
      protocol: 'usenet',
      downloadUrl: 'http://prowlarr:9696/prowlarr/12/download?apikey=test-prowlarr-key&link=abc',
    }),
    headers: { 'content-type': 'application/json' },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.queued, true);
  assert.equal(body.via, 'sabnzbd');
});
