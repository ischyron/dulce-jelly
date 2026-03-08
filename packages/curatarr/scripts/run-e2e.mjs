import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ARTIFACT_DIRS = ['test/results', 'playwright-report'];
const TMP_PREFIX = path.join(os.tmpdir(), 'curatarr-e2e-');
const FIXTURE_API_KEY = 'pw-e2e-key';

function cleanupArtifacts() {
  for (const dir of ARTIFACT_DIRS) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runChecked(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with status ${res.status ?? 'unknown'}`);
  }
}

function ensureBuildArtifacts() {
  if (!existsSync(path.resolve('src/server/dist/index.js'))) {
    runChecked('npm', ['run', 'build:server']);
  }
  if (!existsSync(path.resolve('src/ui/dist/index.html'))) {
    runChecked('npm', ['run', 'build:ui']);
  }
}

function createScoutFixtureReleases() {
  const rows = [];
  for (let i = 1; i <= 20; i++) {
    const tier = i % 4;
    const title =
      tier === 0
        ? `Fixture.Movie.2026.2160p.REMUX.HEVC.TrueHD.Atmos-GRP${i}`
        : tier === 1
          ? `Fixture.Movie.2026.2160p.WEB-DL.HEVC.DDP5.1-GRP${i}`
          : tier === 2
            ? `Fixture.Movie.2026.1080p.WEB-DL.H264.AAC-GRP${i}`
            : `Fixture.Movie.2026.720p.WEBRip.XviD.AC3-GRP${i}`;
    rows.push({
      title,
      indexer: 'FixtureIndexer',
      protocol: 'torrent',
      size: 7_000_000_000 + i * 150_000_000,
      publishDate: `2026-03-${String((i % 9) + 1).padStart(2, '0')}T12:00:00Z`,
      guid: `fixture-guid-${i}`,
      downloadUrl: `https://fixture.invalid/download/${i}`,
      seeders: 5 + i * 3,
      peers: 12 + i * 2,
    });
  }
  return rows;
}

async function startFixtureServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address();
  if (!addr || typeof addr !== 'object') throw new Error('failed to bind fixture server');
  return { server, port: addr.port };
}

async function reserveFreePort() {
  const temp = createServer();
  await new Promise((resolve, reject) => {
    temp.once('error', reject);
    temp.listen(0, '127.0.0.1', resolve);
  });
  const addr = temp.address();
  if (!addr || typeof addr !== 'object') throw new Error('failed to reserve free port');
  const port = addr.port;
  await new Promise((resolve) => temp.close(() => resolve(undefined)));
  return port;
}

async function seedDeterministicDb(dbPath, libraryRoot, prowlarrPort, jellyfinPort) {
  const { CuratDb } = await import('../src/server/dist/db/client.js');
  const db = new CuratDb(dbPath);

  db.setSetting('libraryRoots', JSON.stringify([{ type: 'movies', path: libraryRoot }]));
  db.setSetting('prowlarrUrl', `http://127.0.0.1:${prowlarrPort}`);
  db.setSetting('prowlarrApiKey', FIXTURE_API_KEY);
  db.setSetting('jellyfinUrl', `http://127.0.0.1:${jellyfinPort}`);
  db.setSetting('jellyfinApiKey', 'pw-e2e-jf');

  function addMovie({ title, year, folderName, critic, imdb, genres, tags, jellyfinId, files }) {
    const safeFolder = folderName ?? `${title} (${year})`;
    const folderPath = path.join(libraryRoot, safeFolder);
    mkdirSync(folderPath, { recursive: true });
    const movieId = db.upsertMovie({
      folderPath,
      folderName: safeFolder,
      parsedTitle: title,
      parsedYear: year,
    });
    db.updateMovieMeta(movieId, { genres, tags });
    if (jellyfinId) {
      db.enrichMovieById(movieId, {
        jellyfinId,
        jellyfinTitle: title,
        jellyfinYear: year,
        criticRating: critic,
        communityRating: imdb,
        imdbId: `tt${String(1000000 + movieId)}`,
        tmdbId: String(50000 + movieId),
        genres,
      });
    } else {
      db.enrichMovieById(movieId, {
        criticRating: critic,
        communityRating: imdb,
        imdbId: `tt${String(1000000 + movieId)}`,
        tmdbId: String(50000 + movieId),
        genres,
      });
    }
    for (const file of files) {
      db.upsertFile({
        movieId,
        filePath: path.join(folderPath, file.filename),
        filename: file.filename,
        resolutionCat: file.resolutionCat,
        videoCodec: file.videoCodec,
        audioCodec: file.audioCodec,
        audioLayout: file.audioLayout,
        releaseGroup: file.releaseGroup,
        fileSize: file.fileSize,
        hdrFormats: file.hdrFormats,
        audioTracks: file.audioTracks,
      });
    }
  }

  addMovie({
    title: '(500) Days of Summer',
    year: 2009,
    critic: 85,
    imdb: 7.7,
    genres: ['Drama', 'Romance'],
    tags: ['p1'],
    jellyfinId: 'jf-500',
    files: [
      {
        filename: '(500).Days.of.Summer.2009.1080p.BluRay.x264-YIFY.mkv',
        resolutionCat: '1080p',
        videoCodec: 'h264',
        audioCodec: 'ddp',
        audioLayout: '5.1',
        releaseGroup: 'YIFY',
        fileSize: 4_700_000_000,
        hdrFormats: [],
        audioTracks: [{ index: 1, codec: 'ddp', channels: 6, language: 'eng', isDefault: true }],
      },
    ],
  });

  addMovie({
    title: 'First Man',
    year: 2018,
    critic: 88,
    imdb: 7.3,
    genres: ['Drama'],
    tags: ['upgrade'],
    jellyfinId: 'jf-first-man',
    files: [
      {
        filename: 'First.Man.2018.2160p.WEB-DL.HEVC.DDP5.1-NTb.mkv',
        resolutionCat: '2160p',
        videoCodec: 'hevc',
        audioCodec: 'ddp',
        audioLayout: '5.1',
        releaseGroup: 'NTb',
        fileSize: 15_000_000_000,
        hdrFormats: ['HDR10'],
        audioTracks: [{ index: 1, codec: 'ddp', channels: 6, language: 'eng', isDefault: true }],
      },
    ],
  });

  addMovie({
    title: 'The Matrix',
    year: 1999,
    critic: 85,
    imdb: 8.7,
    genres: ['Sci-Fi'],
    tags: ['av1'],
    jellyfinId: 'jf-matrix',
    files: [
      {
        filename: 'The.Matrix.1999.2160p.WEB-DL.AV1.DDP5.1-FIXTURE.mkv',
        resolutionCat: '2160p',
        videoCodec: 'av1',
        audioCodec: 'ddp',
        audioLayout: '5.1',
        releaseGroup: 'FIXTURE',
        fileSize: 13_000_000_000,
        hdrFormats: ['HDR10', 'DV'],
        audioTracks: [{ index: 1, codec: 'ddp', channels: 6, language: 'eng', isDefault: true }],
      },
    ],
  });

  addMovie({
    title: 'Legacy Sample',
    year: 2001,
    critic: 72,
    imdb: 6.9,
    genres: ['Action'],
    tags: ['legacy'],
    jellyfinId: null,
    files: [
      {
        filename: 'Legacy.Sample.2001.1080p.WEBRip.XviD.AC3-FIXTURE.avi',
        resolutionCat: '1080p',
        videoCodec: 'mpeg4',
        audioCodec: 'ac3',
        audioLayout: '5.1',
        releaseGroup: 'FIXTURE',
        fileSize: 2_400_000_000,
        hdrFormats: [],
        audioTracks: [{ index: 1, codec: 'ac3', channels: 6, language: 'eng', isDefault: true }],
      },
    ],
  });

  addMovie({
    title: 'Multi Version Film',
    year: 2010,
    critic: 81,
    imdb: 7.2,
    genres: ['Thriller'],
    tags: ['multi'],
    jellyfinId: 'jf-multi',
    files: [
      {
        filename: 'Multi.Version.Film.2010.1080p.BluRay.x264-GRP.mkv',
        resolutionCat: '1080p',
        videoCodec: 'h264',
        audioCodec: 'dts',
        audioLayout: '5.1',
        releaseGroup: 'GRP',
        fileSize: 6_300_000_000,
        hdrFormats: [],
        audioTracks: [{ index: 1, codec: 'dts', channels: 6, language: 'eng', isDefault: true }],
      },
      {
        filename: 'Multi.Version.Film.2010.2160p.WEB-DL.HEVC.DDP5.1-GRP.mkv',
        resolutionCat: '2160p',
        videoCodec: 'hevc',
        audioCodec: 'ddp',
        audioLayout: '5.1',
        releaseGroup: 'GRP',
        fileSize: 14_100_000_000,
        hdrFormats: ['HDR10'],
        audioTracks: [{ index: 1, codec: 'ddp', channels: 6, language: 'eng', isDefault: true }],
      },
    ],
  });

  db.close();
}

async function waitForUrl(url, timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  cleanupArtifacts();
  ensureBuildArtifacts();

  const tempRoot = mkdtempSync(TMP_PREFIX);
  const dbPath = path.join(tempRoot, 'curatarr.e2e.db');
  const libraryRoot = path.join(tempRoot, 'library', 'movies');
  const tempConfigDir = path.join(tempRoot, 'config');
  const tempDataDir = path.join(tempRoot, 'data', 'curatarr');
  mkdirSync(libraryRoot, { recursive: true });
  mkdirSync(tempConfigDir, { recursive: true });
  mkdirSync(tempDataDir, { recursive: true });

  const scoutReleases = createScoutFixtureReleases();
  const jellyfinMovies = [
    {
      Id: 'jf-500',
      Name: '(500) Days of Summer',
      ProductionYear: 2009,
      Path: path.join(
        libraryRoot,
        '(500) Days of Summer (2009)',
        '(500).Days.of.Summer.2009.1080p.BluRay.x264-YIFY.mkv',
      ),
      CriticRating: 85,
      CommunityRating: 7.7,
      Genres: ['Drama', 'Romance'],
      ProviderIds: { Imdb: 'tt1022603', Tmdb: '19913' },
      MediaSources: [],
    },
    {
      Id: 'jf-legacy',
      Name: 'Legacy Sample',
      ProductionYear: 2001,
      Path: path.join(libraryRoot, 'Legacy Sample (2001)', 'Legacy.Sample.2001.1080p.WEBRip.XviD.AC3-FIXTURE.avi'),
      CriticRating: 72,
      CommunityRating: 6.9,
      Genres: ['Action'],
      ProviderIds: { Imdb: 'tt0000001', Tmdb: '50001' },
      MediaSources: [],
    },
    {
      Id: 'jf-multi-a',
      Name: 'Multi Version Film',
      ProductionYear: 2010,
      Path: path.join(libraryRoot, 'Multi Version Film (2010)', 'Multi.Version.Film.2010.1080p.BluRay.x264-GRP.mkv'),
      CriticRating: 81,
      CommunityRating: 7.2,
      Genres: ['Thriller'],
      ProviderIds: { Imdb: 'tt0000002', Tmdb: '50002' },
      MediaSources: [],
    },
    {
      Id: 'jf-multi-b',
      Name: 'Multi Version Film',
      ProductionYear: 2010,
      Path: path.join(
        libraryRoot,
        'Multi Version Film (2010)',
        'Multi.Version.Film.2010.2160p.WEB-DL.HEVC.DDP5.1-GRP.mkv',
      ),
      CriticRating: 82,
      CommunityRating: 7.3,
      Genres: ['Thriller'],
      ProviderIds: { Imdb: 'tt0000003', Tmdb: '50003' },
      MediaSources: [],
    },
  ];
  const prowlarrFixture = await startFixtureServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = String(req.headers['x-api-key'] ?? '');
    if (key !== FIXTURE_API_KEY) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (url.pathname === '/api/v1/indexer') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ id: 1, name: 'FixtureIndexer', protocol: 'torrent' }]));
      return;
    }
    if (url.pathname === '/api/v1/search') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(scoutReleases));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  const jellyfinFixture = await startFixtureServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const token = String(req.headers['x-emby-token'] ?? '');
    if (token !== 'pw-e2e-jf') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (url.pathname === '/Library/VirtualFolders') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            ItemId: 'lib-movies',
            Name: 'Movies',
            CollectionType: 'movies',
            Locations: [libraryRoot],
          },
        ]),
      );
      return;
    }
    if (url.pathname === '/Items') {
      const ids = url.searchParams.get('Ids');
      const searchTerm = (url.searchParams.get('SearchTerm') ?? '').toLowerCase();
      if (ids) {
        // Force one id-lookup miss for fallback-path coverage in jf-refresh e2e.
        const items = ids === 'jf-multi' ? [] : jellyfinMovies.filter((m) => m.Id === ids);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ Items: items, TotalRecordCount: items.length }));
        return;
      }
      if (searchTerm) {
        const items = jellyfinMovies.filter((m) => m.Name.toLowerCase().includes(searchTerm));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ Items: items, TotalRecordCount: items.length }));
        return;
      }
      const parentId = url.searchParams.get('ParentId');
      const items = parentId === 'lib-movies' ? jellyfinMovies : [];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ Items: items, TotalRecordCount: items.length }));
      return;
    }
    if (url.pathname.startsWith('/Items/') && url.pathname.includes('/Images/Primary')) {
      const pngFallback = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n2n0AAAAASUVORK5CYII=',
        'base64',
      );
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(pngFallback);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await seedDeterministicDb(dbPath, libraryRoot, prowlarrFixture.port, jellyfinFixture.port);

  const appPort = Number(process.env.CURATARR_E2E_PORT || (await reserveFreePort()));
  const distServerEntry = path.resolve('src/server/dist/index.js');
  const tempConfigYaml = `server:\n  host: 127.0.0.1\n  port: ${appPort}\npaths:\n  curatarrDataPath: ./data/curatarr\n`;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path.join(tempConfigDir, 'config.yaml'), tempConfigYaml, 'utf8');

  const serverProcess = spawn(
    'node',
    [distServerEntry, 'serve', '--db', dbPath, '--port', String(appPort), '--host', '127.0.0.1'],
    {
      stdio: 'inherit',
      env: process.env,
      cwd: tempRoot,
    },
  );

  let exitCode = 1;
  try {
    console.log(`[e2e] waiting for app readiness on :${appPort}`);
    await waitForUrl(`http://127.0.0.1:${appPort}/api/stats`);
    console.log('[e2e] app ready; starting Playwright');
    const child = spawn('npx', ['playwright', 'test', '--config=playwright.config.cjs', '--reporter=line'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CURATARR_BASE_URL: `http://127.0.0.1:${appPort}`,
      },
    });
    exitCode = await new Promise((resolve) => {
      child.on('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }
        resolve(code ?? 1);
      });
    });
    console.log(`[e2e] playwright exited with code ${exitCode}`);
  } finally {
    if (!serverProcess.killed) {
      serverProcess.kill('SIGINT');
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!serverProcess.killed) serverProcess.kill('SIGKILL');
    }
    await new Promise((resolve) => prowlarrFixture.server.close(() => resolve(undefined)));
    await new Promise((resolve) => jellyfinFixture.server.close(() => resolve(undefined)));
    rmSync(tempRoot, { recursive: true, force: true });
    if (exitCode === 0) cleanupArtifacts();
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
