/**
 * Directory walker tests — against real library
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { parseFolderName, walkLibrary, countMovieFolders } = await import('../dist/scanner/walker.js');

// ──────────────────────────────────────────────────────────────────
// parseFolderName — unit tests
// ──────────────────────────────────────────────────────────────────

describe('parseFolderName', () => {
  test('parses standard format', () => {
    const r = parseFolderName('Rashomon (1950)');
    assert.equal(r.title, 'Rashomon');
    assert.equal(r.year, 1950);
  });

  test('parses title with colon', () => {
    const r = parseFolderName('Mad Max: Fury Road (2015)');
    assert.equal(r.title, 'Mad Max: Fury Road');
    assert.equal(r.year, 2015);
  });

  test('parses title starting with number', () => {
    const r = parseFolderName('12 Angry Men (1957)');
    assert.equal(r.title, '12 Angry Men');
    assert.equal(r.year, 1957);
  });

  test('handles missing year gracefully', () => {
    const r = parseFolderName('Some Movie Without Year');
    assert.equal(r.title, 'Some Movie Without Year');
    assert.equal(r.year, undefined);
  });

  test('handles special chars in title', () => {
    const r = parseFolderName('(500) Days of Summer (2009)');
    assert.equal(r.year, 2009);
  });

  test('handles dash in title', () => {
    const r = parseFolderName('13 Hours- The Secret Soldiers of Benghazi (2016)');
    assert.equal(r.year, 2016);
  });
});

// ──────────────────────────────────────────────────────────────────
// Integration: walk real library
// ──────────────────────────────────────────────────────────────────

const LIBRARY_ROOT = path.join(os.homedir(), 'Media/MEDIA1/Movies');
const libraryExists = existsSync(LIBRARY_ROOT);

test('countMovieFolders returns > 0 for real library', {
  skip: !libraryExists,
}, () => {
  const count = countMovieFolders(LIBRARY_ROOT);
  assert.ok(count > 100, `Expected > 100 folders, got ${count}`);
  console.log(`  Library has ${count} folders`);
});

test('walkLibrary yields movie folders with video files', {
  skip: !libraryExists,
}, () => {
  let folderCount = 0;
  let totalVideoFiles = 0;
  let foldersWithYear = 0;
  const sampleFolders = [];

  for (const folder of walkLibrary(LIBRARY_ROOT)) {
    folderCount++;
    totalVideoFiles += folder.videoFiles.length;
    if (folder.parsedYear) foldersWithYear++;
    if (sampleFolders.length < 5) sampleFolders.push(folder);

    // Stop early for speed
    if (folderCount >= 20) break;
  }

  assert.ok(folderCount > 0, 'Should find some folders');
  assert.ok(totalVideoFiles > 0, 'Should find some video files');
  assert.ok(foldersWithYear > 0, 'Should parse years from folder names');

  console.log(`  Walked ${folderCount} folders (first 20)`);
  console.log(`  Total video files: ${totalVideoFiles}`);
  console.log(`  Folders with parsed year: ${foldersWithYear}`);
  console.log(`  Sample folders:`);
  for (const f of sampleFolders) {
    console.log(`    "${f.folderName}" → title="${f.parsedTitle}" year=${f.parsedYear} files=${f.videoFiles.length}`);
  }
});
