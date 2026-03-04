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

    const scoutRes = await request.post('/api/scout/search-one', {
      data: { movieId: first.id },
    });

    if (!hasProwlarr) {
      expect(scoutRes.status()).toBe(422);
      const body = await scoutRes.json();
      expect(body.error).toBe('prowlarr_not_configured');
      return;
    }

    expect([200, 502]).toContain(scoutRes.status());
  });
});
