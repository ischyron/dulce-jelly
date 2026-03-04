import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ProwlarrClient } from '../dist/integrations/prowlarr/client.js';

test('Prowlarr client parses realistic movie search payload from mock API', async () => {
  const mockRows = [
    {
      title: '10 Cloverfield Lane 2016 2160p UHD BluRay REMUX HEVC TrueHD Atmos',
      indexer: 'MockIndexer',
      protocol: 'usenet',
      size: 56169203712,
      publishDate: '2026-03-03T11:30:00Z',
      guid: 'mock-guid-001',
      downloadUrl: 'https://indexer.example/download/001',
      seeders: 42,
      peers: 55,
    },
  ];

  let seenPath = '';
  let seenApiKey = '';
  const server = http.createServer((req, res) => {
    seenPath = req.url ?? '';
    seenApiKey = String(req.headers['x-api-key'] ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(mockRows));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const client = new ProwlarrClient(baseUrl, 'test-key');
    const releases = await client.searchMovie('10 Cloverfield Lane 2016');

    assert.equal(seenApiKey, 'test-key');
    assert.ok(seenPath.startsWith('/api/v1/search?'));
    assert.match(seenPath, /query=10\+Cloverfield\+Lane\+2016/);
    assert.match(seenPath, /type=movie/);

    assert.equal(releases.length, 1);
    assert.equal(releases[0].title, mockRows[0].title);
    assert.equal(releases[0].indexer, 'MockIndexer');
    assert.equal(releases[0].protocol, 'usenet');
    assert.equal(releases[0].size, 56169203712);
    assert.equal(releases[0].seeders, 42);
    assert.equal(releases[0].guid, 'mock-guid-001');
    assert.equal(releases[0].downloadUrl, 'https://indexer.example/download/001');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
