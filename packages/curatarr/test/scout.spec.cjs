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

  test('trash parity endpoint returns status payload', async ({ request }) => {
    const res = await request.get('/api/scout/trash-parity');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(['in_sync', 'drifted', 'unknown']).toContain(body.state);
    expect(body).toHaveProperty('diff');
  });

  test('scout refinement draft endpoint reflects usenet + compatibility objective', async ({ request }) => {
    const res = await request.post('/api/scout/rules/refine-draft', {
      data: { objective: 'Prefer usenet in close ties. Prioritize compatibility on Android TV. Avoid AV1 when compatibility is uncertain.' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt.length).toBeGreaterThan(50);
    expect(body.proposedSettings).toBeTruthy();
    expect(body.proposedSettings.scoutCfUsenetBonus).toBe('12');
    expect(body.proposedSettings.scoutCfTorrentBonus).toBe('-2');
    expect(body.proposedSettings.scoutCfCodecAv1).toBe('6');
    expect(body.proposedSettings.scoutCfCodecH264).toBe('14');
  });

  test('custom CF preview and validation', async ({ request }) => {
    const badSave = await request.put('/api/rules', {
      data: {
        rules: [{
          category: 'scout_custom_cf',
          name: 'Broken Regex',
          enabled: true,
          priority: 1,
          config: { matchType: 'regex', pattern: '([', score: 5, flags: 'i', appliesTo: 'title' },
        }],
      },
    });
    expect(badSave.status()).toBe(400);

    const save = await request.put('/api/rules', {
      data: {
        rules: [{
          category: 'scout_custom_cf',
          name: 'DDP Boost',
          enabled: true,
          priority: 1,
          config: { matchType: 'regex', pattern: '\\bDD[P+](?!A)|\\b(e[-_. ]?ac-?3)\\b', score: 7, flags: 'i', appliesTo: 'title' },
        }],
      },
    });
    expect(save.ok()).toBeTruthy();

    const preview = await request.post('/api/scout/custom-cf/preview', {
      data: { title: 'Some.Movie.2025.2160p.WEB-DL.DDP5.1.x265' },
    });
    expect(preview.ok()).toBeTruthy();
    const body = await preview.json();
    expect(body.delta).toBeGreaterThanOrEqual(7);
    expect(Array.isArray(body.reasons)).toBeTruthy();
  });

  test('llm ruleset persists ordered natural rules', async ({ request }) => {
    const save = await request.put('/api/rules', {
      data: {
        rules: [
          {
            category: 'scout_llm_ruleset',
            name: 'Rule B',
            enabled: true,
            priority: 2,
            config: { sentence: 'Prefer usenet in close ties.' },
          },
          {
            category: 'scout_llm_ruleset',
            name: 'Rule A',
            enabled: true,
            priority: 1,
            config: { sentence: 'Drop CAM releases.' },
          },
        ],
      },
    });
    expect(save.ok()).toBeTruthy();

    const list = await request.get('/api/rules?category=scout_llm_ruleset');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const rows = body?.rules?.scout_llm_ruleset ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].priority).toBeLessThanOrEqual(rows[rows.length - 1].priority);
    expect(typeof rows[0].config?.sentence).toBe('string');
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
