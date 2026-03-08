// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Scout feature checks', () => {
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

    expect(settings).toHaveProperty('scoutPipelineMinCritic');
    expect(settings).toHaveProperty('scoutPipelineMinImdb');
    expect(settings).toHaveProperty('scoutPipelineBatchSize');
    expect(settings).toHaveProperty('scoutPipelineAutoEnabled');
  });

  test('sync TRaSH scores refreshes read-only sync metadata', async ({ request }) => {
    const res = await request.post('/api/scout/sync-trash-scores', { data: {} });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.meta?.source).toBe('TRaSH-Guides');
    expect(typeof body.syncModelVersion).toBe('string');
    expect(typeof body.mappingRevision).toBe('string');
    expect(body.syncedRules).toBe(0);

    const settingsRes = await request.get('/api/settings');
    const settings = (await settingsRes.json()).settings ?? {};
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
      data: {
        objective:
          'Prefer usenet in close ties. Prioritize compatibility on Android TV. Avoid AV1 when compatibility is uncertain.',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.prompt).toBe('string');
    expect(body.prompt.length).toBeGreaterThan(50);
    expect(body.proposedSettings).toBeTruthy();
    expect(body.proposedSettings.scoutPipelineBasicUsenetBonus).toBe('12');
    expect(body.proposedSettings.scoutPipelineBasicTorrentBonus).toBe('-2');
    expect(body.proposedSettings.scoutPipelineBasicVideoAv1).toBe('6');
    expect(body.proposedSettings.scoutPipelineBasicVideoH264).toBe('14');
  });

  test('custom CF preview + create/disable/delete lifecycle', async ({ request }) => {
    const ruleName = `DDP Boost ${Date.now()}`;

    const badSave = await request.put('/api/rules', {
      data: {
        rules: [
          {
            category: 'scout_custom_cf',
            name: 'Broken Regex',
            enabled: true,
            priority: 1,
            config: { matchType: 'regex', pattern: '([', score: 5, flags: 'i', appliesTo: 'title' },
          },
        ],
      },
    });
    expect(badSave.status()).toBe(400);

    try {
      const save = await request.put('/api/scout/rules/replace-category', {
        data: {
          category: 'scout_custom_cf',
          rules: [
            {
              name: ruleName,
              enabled: true,
              priority: 1,
              config: {
                matchType: 'regex',
                pattern: '\\bDD[P+](?!A)|\\b(e[-_. ]?ac-?3)\\b',
                score: 7,
                flags: 'i',
                appliesTo: 'title',
              },
            },
          ],
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

      const disable = await request.put('/api/scout/rules/replace-category', {
        data: {
          category: 'scout_custom_cf',
          rules: [
            {
              name: ruleName,
              enabled: false,
              priority: 1,
              config: {
                matchType: 'regex',
                pattern: '\\bDD[P+](?!A)|\\b(e[-_. ]?ac-?3)\\b',
                score: 7,
                flags: 'i',
                appliesTo: 'title',
              },
            },
          ],
        },
      });
      expect(disable.ok()).toBeTruthy();

      const disabledPreview = await request.post('/api/scout/custom-cf/preview', {
        data: { title: 'Some.Movie.2025.2160p.WEB-DL.DDP5.1.x265' },
      });
      expect(disabledPreview.ok()).toBeTruthy();
      const disabledBody = await disabledPreview.json();
      expect(disabledBody.delta).toBe(0);
    } finally {
      const cleanup = await request.put('/api/scout/rules/replace-category', {
        data: { category: 'scout_custom_cf', rules: [] },
      });
      expect(cleanup.ok()).toBeTruthy();
      const list = await request.get('/api/scout/rules?category=scout_custom_cf');
      const listBody = await list.json();
      const rows = listBody?.rules?.scout_custom_cf ?? [];
      expect(rows).toHaveLength(0);
    }
  });

  test('llm ruleset create/disable/delete lifecycle', async ({ request }) => {
    const ruleName = `Rule ${Date.now()}`;

    try {
      const save = await request.put('/api/scout/rules/replace-category', {
        data: {
          category: 'scout_llm_ruleset',
          rules: [
            {
              name: ruleName,
              enabled: true,
              priority: 1,
              config: { sentence: 'Prefer usenet in close ties.' },
            },
          ],
        },
      });
      expect(save.ok()).toBeTruthy();

      const list = await request.get('/api/scout/rules?category=scout_llm_ruleset');
      expect(list.ok()).toBeTruthy();
      const body = await list.json();
      const rows = body?.rules?.scout_llm_ruleset ?? [];
      expect(rows.length).toBe(1);
      expect(rows[0].enabled).toBe(1);
      expect(rows[0].name).toBe(ruleName);

      const disable = await request.put('/api/scout/rules/replace-category', {
        data: {
          category: 'scout_llm_ruleset',
          rules: [
            {
              name: ruleName,
              enabled: false,
              priority: 1,
              config: { sentence: 'Prefer usenet in close ties.' },
            },
          ],
        },
      });
      expect(disable.ok()).toBeTruthy();

      const disabledList = await request.get('/api/scout/rules?category=scout_llm_ruleset');
      const disabledBody = await disabledList.json();
      const disabledRows = disabledBody?.rules?.scout_llm_ruleset ?? [];
      expect(disabledRows.length).toBe(1);
      expect(disabledRows[0].enabled).toBe(0);
    } finally {
      const cleanup = await request.put('/api/scout/rules/replace-category', {
        data: { category: 'scout_llm_ruleset', rules: [] },
      });
      expect(cleanup.ok()).toBeTruthy();
      const list = await request.get('/api/scout/rules?category=scout_llm_ruleset');
      const body = await list.json();
      const rows = body?.rules?.scout_llm_ruleset ?? [];
      expect(rows).toHaveLength(0);
    }
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

  test('scout percentile gate drops bottom 90%, and LLM-active flow returns one candidate', async ({ request }) => {
    test.setTimeout(120_000);

    const settingsRes = await request.get('/api/settings');
    expect(settingsRes.ok()).toBeTruthy();
    const settings = (await settingsRes.json())?.settings ?? {};
    const hasProwlarr = Boolean(settings.prowlarrUrl);
    test.skip(!hasProwlarr, 'requires configured Prowlarr for live scout search');

    const candidateRes = await request.get('/api/candidates?criticScoreMin=0&imdbScoreMin=0&resolution=2160p&limit=1');
    expect(candidateRes.ok()).toBeTruthy();
    const candidateJson = await candidateRes.json();
    const firstMovieId = candidateJson?.candidates?.[0]?.id;
    expect(firstMovieId).toBeTruthy();

    const saveSettingsRes = await request.put('/api/settings', {
      data: {
        scoutPipelineBlockersEnabled: 'false',
      },
    });
    expect(saveSettingsRes.ok()).toBeTruthy();

    // Keep this test self-contained: no LLM rules for the first pass.
    const clearLlmRes = await request.put('/api/scout/rules/replace-category', {
      data: { category: 'scout_llm_ruleset', rules: [] },
    });
    expect(clearLlmRes.ok()).toBeTruthy();

    const queries = ['first man 2018', 'inception 2010', 'matrix 1999', 'batman 2022'];
    let baseline = null;
    for (const q of queries) {
      const res = await request.post('/api/scout/search-one', {
        data: { movieId: firstMovieId, query: q },
      });
      if (!res.ok()) continue;
      const body = await res.json();
      const totalSeen = (body?.releases?.length ?? 0) + (body?.droppedReleases?.length ?? 0);
      if (totalSeen >= 10) {
        baseline = body;
        break;
      }
    }
    test.skip(!baseline, 'no sufficiently large scout result set available to validate percentile gating');

    const baselineCandidates = baseline.releases ?? [];
    const baselineDropped = baseline.droppedReleases ?? [];
    const baselineTotal = baselineCandidates.length + baselineDropped.length;
    const expectedKeep = Math.max(1, Math.ceil(baselineTotal * 0.1));
    expect(baselineCandidates.length).toBe(expectedKeep);
    expect(baselineDropped.length).toBe(baselineTotal - expectedKeep);
    expect(
      baselineDropped.every((r) => typeof r?.droppedReason === 'string' && r.droppedReason.includes('percentile gate')),
    ).toBeTruthy();

    const llmRuleName = `LLM One-Candidate ${Date.now()}`;
    try {
      const setLlmRes = await request.put('/api/scout/rules/replace-category', {
        data: {
          category: 'scout_llm_ruleset',
          rules: [
            {
              name: llmRuleName,
              enabled: true,
              priority: 1,
              config: { sentence: 'Prefer usenet in close ties.' },
            },
          ],
        },
      });
      expect(setLlmRes.ok()).toBeTruthy();

      const llmSearchRes = await request.post('/api/scout/search-one', {
        data: { movieId: firstMovieId, query: baseline.query },
      });
      expect(llmSearchRes.ok()).toBeTruthy();
      const llmBody = await llmSearchRes.json();
      const llmCandidates = llmBody?.releases ?? [];
      const llmDropped = llmBody?.droppedReleases ?? [];
      const llmTotal = llmCandidates.length + llmDropped.length;
      expect(llmTotal).toBeGreaterThan(0);
      expect(llmCandidates.length).toBe(1);
      expect(
        llmDropped.some(
          (r) => typeof r?.droppedReason === 'string' && r.droppedReason.includes('single-candidate enforcement'),
        ),
      ).toBeTruthy();
    } finally {
      const cleanup = await request.put('/api/scout/rules/replace-category', {
        data: { category: 'scout_llm_ruleset', rules: [] },
      });
      expect(cleanup.ok()).toBeTruthy();
    }
  });

  test('scout search-one cache hits within TTL and invalidates on scout settings change', async ({ request }) => {
    test.setTimeout(120_000);

    const settingsRes = await request.get('/api/settings');
    expect(settingsRes.ok()).toBeTruthy();
    const settings = (await settingsRes.json())?.settings ?? {};
    const hasProwlarr = Boolean(settings.prowlarrUrl);
    test.skip(!hasProwlarr, 'requires configured Prowlarr for live scout search');

    const candidateRes = await request.get('/api/candidates?criticScoreMin=0&imdbScoreMin=0&resolution=2160p&limit=1');
    expect(candidateRes.ok()).toBeTruthy();
    const candidateJson = await candidateRes.json();
    const firstMovieId = candidateJson?.candidates?.[0]?.id;
    expect(firstMovieId).toBeTruthy();

    const query = `First Man 2018 cache-${Date.now()}`;
    const firstRes = await request.post('/api/scout/search-one', {
      data: { movieId: firstMovieId, query },
    });
    expect(firstRes.ok()).toBeTruthy();
    const firstBody = await firstRes.json();
    expect(firstBody?.cache?.hit).toBe(false);
    expect(typeof firstBody?.cache?.revision).toBe('string');

    const secondRes = await request.post('/api/scout/search-one', {
      data: { movieId: firstMovieId, query },
    });
    expect(secondRes.ok()).toBeTruthy();
    const secondBody = await secondRes.json();
    expect(secondBody?.cache?.hit).toBe(true);
    expect(secondBody?.cache?.revision).toBe(firstBody?.cache?.revision);
    expect(secondBody?.releases?.length).toBe(firstBody?.releases?.length);
    expect(secondBody?.droppedReleases?.length).toBe(firstBody?.droppedReleases?.length);

    const forcedRes = await request.post('/api/scout/search-one', {
      data: { movieId: firstMovieId, query, forceRefresh: true },
    });
    expect(forcedRes.ok()).toBeTruthy();
    const forcedBody = await forcedRes.json();
    expect(forcedBody?.cache?.hit).toBe(false);

    const postForceRes = await request.post('/api/scout/search-one', {
      data: { movieId: firstMovieId, query },
    });
    expect(postForceRes.ok()).toBeTruthy();
    const postForceBody = await postForceRes.json();
    expect(postForceBody?.cache?.hit).toBe(true);

    const prevRes1080 = settings.scoutPipelineBasicRes1080 ?? '24';
    const nextRes1080 = String(Number.parseInt(prevRes1080, 10) === 24 ? 25 : 24);
    try {
      const updateRes = await request.put('/api/settings', {
        data: { scoutPipelineBasicRes1080: nextRes1080 },
      });
      expect(updateRes.ok()).toBeTruthy();

      const thirdRes = await request.post('/api/scout/search-one', {
        data: { movieId: firstMovieId, query },
      });
      expect(thirdRes.ok()).toBeTruthy();
      const thirdBody = await thirdRes.json();
      expect(thirdBody?.cache?.hit).toBe(false);
      expect(thirdBody?.cache?.revision).not.toBe(secondBody?.cache?.revision);
    } finally {
      const restoreRes = await request.put('/api/settings', {
        data: { scoutPipelineBasicRes1080: prevRes1080 },
      });
      expect(restoreRes.ok()).toBeTruthy();
    }
  });

  test('scout search-one behavior matches prowlarr config state', async ({ request }) => {
    const settingsRes = await request.get('/api/settings');
    expect(settingsRes.ok()).toBeTruthy();
    const settingsJson = await settingsRes.json();
    const hasProwlarr = Boolean(settingsJson?.settings?.prowlarrUrl);

    const candidateRes = await request.get('/api/candidates?criticScoreMin=0&imdbScoreMin=0&resolution=2160p&limit=1');
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
