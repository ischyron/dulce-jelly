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
