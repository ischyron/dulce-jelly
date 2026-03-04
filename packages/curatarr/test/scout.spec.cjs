// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Scout feature checks', () => {
  test('scout rules are seeded and include legacy replacement', async ({ request }) => {
    const res = await request.get('/api/rules?category=scout');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const rules = json?.rules?.scout ?? [];
    expect(Array.isArray(rules)).toBeTruthy();
    expect(rules.length).toBeGreaterThan(0);

    const names = rules.map((r) => r.name);
    expect(names).toContain('MPEG4/legacy codec replacement');
    expect(names).toContain('Upgrade priority targets');
  });

  test('scout batch hard cap rejects payload > 10', async ({ request }) => {
    const movieIds = Array.from({ length: 11 }, (_, i) => i + 1);
    const res = await request.post('/api/scout/search-batch', {
      data: { movieIds },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('batch_limit_exceeded');
    expect(json.max).toBe(10);
  });

  test('settings expose scout controls', async ({ request }) => {
    const res = await request.get('/api/settings');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const settings = json.settings ?? {};

    expect(settings).toHaveProperty('scoutMinCritic');
    expect(settings).toHaveProperty('scoutMinCommunity');
    expect(settings).toHaveProperty('scoutMaxResolution');
    expect(settings).toHaveProperty('scoutSearchBatchSize');
    expect(settings).toHaveProperty('scoutAutoEnabled');
  });

  test('sync TRaSH scores updates scout CF settings', async ({ request }) => {
    const res = await request.post('/api/scout/sync-trash-scores', { data: {} });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.applied).toBeTruthy();
    expect(body.applied.scoutCfRes2160).toBeTruthy();
    expect(body.meta?.source).toBe('TRaSH-Guides');

    const settingsRes = await request.get('/api/settings');
    const settings = (await settingsRes.json()).settings ?? {};
    expect(settings.scoutCfRes2160).toBe(body.applied.scoutCfRes2160);
    expect(settings.scoutTrashSyncSource).toBe('TRaSH-Guides');
    expect(Object.prototype.hasOwnProperty.call(settings, 'scoutTrashSyncRevision')).toBeTruthy();
    expect(settings.scoutTrashSyncedAt).toBeTruthy();
    if (Object.prototype.hasOwnProperty.call(settings, 'scoutTrashSyncedRules')) {
      expect(settings.scoutTrashSyncedRules).toBe(String(body.syncedRules));
    }
  });

  test('scout refinement draft endpoint returns prompt + suggestions', async ({ request }) => {
    const res = await request.post('/api/scout/rules/refine-draft', {
      data: { objective: 'favor compatibility on android tv and reduce transcodes' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.mode).toBe('heuristic');
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt.length).toBeGreaterThan(50);
    expect(body.proposedSettings).toBeTruthy();
  });

  test('movies endpoint supports multi-version filter', async ({ request }) => {
    const allRes = await request.get('/api/movies?limit=1&page=1');
    expect(allRes.ok()).toBeTruthy();
    const allJson = await allRes.json();
    expect(typeof allJson.total).toBe('number');

    const multiRes = await request.get('/api/movies?limit=5&page=1&multi=true');
    expect(multiRes.ok()).toBeTruthy();
    const multiJson = await multiRes.json();
    expect(typeof multiJson.total).toBe('number');
    expect(multiJson.total).toBeLessThanOrEqual(allJson.total);
    expect(Array.isArray(multiJson.movies)).toBeTruthy();
  });

  test('scout search-one behavior matches prowlarr config state', async ({ request }) => {
    const settingsRes = await request.get('/api/settings');
    expect(settingsRes.ok()).toBeTruthy();
    const settingsJson = await settingsRes.json();
    const hasProwlarr = Boolean(settingsJson?.settings?.prowlarrUrl);

    const candidateRes = await request.get('/api/candidates?minCritic=0&minCommunity=0&maxResolution=2160p&limit=1');
    expect(candidateRes.ok()).toBeTruthy();
    const candidateJson = await candidateRes.json();
    const first = candidateJson?.candidates?.[0];
    expect(first?.id).toBeTruthy();

    if (!hasProwlarr) {
      const scoutRes = await request.post('/api/scout/search-one', {
        data: { movieId: first.id },
      });
      expect(scoutRes.status()).toBe(422);
      const body = await scoutRes.json();
      expect(body.error).toBe('prowlarr_not_configured');
      return;
    }

    // Keep this fast/deterministic when Prowlarr is configured:
    // movie_not_found path validates request plumbing without waiting on live indexer search.
    const scoutRes = await request.post('/api/scout/search-one', {
      data: { movieId: 99999999 },
    });
    expect(scoutRes.status()).toBe(404);
    const body = await scoutRes.json();
    expect(body.error).toBe('movie_not_found');
  });
});
