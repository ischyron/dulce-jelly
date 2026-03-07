/**
 * Curatarr UI smoke tests — Playwright
 * Run: npm run test:e2e
 */

// @ts-check
const { test, expect } = require('@playwright/test');

function qs(obj) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && String(v) !== '')),
  ).toString();
}

function toApiParams(pageParams) {
  const apiParams = { ...pageParams };
  if (!('limit' in apiParams)) apiParams.limit = '50';
  if (apiParams.hdr === '1') apiParams.hdr = 'true';
  if (apiParams.dv === '1') apiParams.dv = 'true';
  if (apiParams.legacy === '1') apiParams.legacy = 'true';
  if (apiParams.noJf === '1') apiParams.noJf = 'true';
  if (apiParams.multi === '1') apiParams.multi = 'true';
  if (apiParams.av1Compat === '1') {
    delete apiParams.av1Compat;
    apiParams.codec = 'av1';
  }
  if (apiParams.q) {
    apiParams.search = apiParams.q;
    delete apiParams.q;
  }
  return apiParams;
}

async function assertLibraryParity(page, request, pageParams, label) {
  const errors = [];
  const onErr = (e) => errors.push(e.message);
  page.on('pageerror', onErr);
  try {
    const apiParams = toApiParams(pageParams);
    const apiRes = await request.get(`/api/movies?${qs(apiParams)}`);
    expect(apiRes.ok(), `${label}: API failed`).toBeTruthy();
    const apiJson = await apiRes.json();
    const expectedRows = Array.isArray(apiJson.movies) ? apiJson.movies.length : 0;

    await page.goto(`/library?${qs(pageParams)}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const uiRows = await page.locator('tbody tr').count();
    expect(uiRows, `${label}: UI rows should equal API movies.length`).toBe(expectedRows);

    if (expectedRows > 0) {
      await expect(page.locator('tbody tr').first(), `${label}: first row should be visible`).toBeVisible();
      await expect(page.getByText('No movies match the current filters.')).toBeHidden();
    } else {
      await expect(
        page.getByText('No movies match the current filters.'),
        `${label}: empty state expected`,
      ).toBeVisible();
    }
    expect(errors, `${label}: page errors detected`).toEqual([]);
  } finally {
    page.off('pageerror', onErr);
  }
}

test.describe('Dashboard', () => {
  test('loads and links to key filters', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Resolution Distribution')).toBeVisible();

    const hdrLink = page.locator('a[href*="/library?hdr=1"]');
    const dvLink = page.locator('a[href*="/library?dv=1"]');
    await expect(hdrLink).toBeVisible();
    await expect(dvLink).toBeVisible();
  });

  test('movies card info tooltip is clickable without triggering card navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('button', { name: 'Movies info' }).click();
    await expect(page.getByText('Curatarr treats one library folder as one movie record.')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('movies card body remains fully clickable and opens Library', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Open library from Movies card').click({ position: { x: 24, y: 24 } });
    await expect(page).toHaveURL(/\/library(?:\?reset=1)?$/);
  });
});

test.describe('Library', () => {
  test('loads with filters and table', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByPlaceholder('Search titles…')).toBeVisible();
    await page.waitForSelector('tbody tr', { timeout: 10000 });
  });

  test('AV1 compat filter is bookmarkable and active', async ({ page }) => {
    await page.goto('/library?av1Compat=1');
    const checkbox = page.getByLabel('AV1 compat');
    await expect(checkbox).toBeChecked();
    await expect(page).toHaveURL(/av1Compat=1/);
  });

  test('multi-version filter is bookmarkable and active', async ({ page }) => {
    await page.goto('/library?multi=1');
    const checkbox = page.getByLabel('Has multi-part/versions');
    await expect(checkbox).toBeChecked();
    await expect(page).toHaveURL(/multi=1/);
  });

  test('numeric search works for 500', async ({ page }) => {
    await page.goto('/library');
    const search = page.getByPlaceholder('Search titles…');
    await search.fill('500');
    await page.waitForTimeout(450);
    await expect(page).toHaveURL(/q=500/);
    await expect(page.locator('tbody tr').first()).toContainText(/500|\(500\)/i);
  });

  test('status tooltip opens and closes on outside click', async ({ page }) => {
    await page.goto('/library');
    await page.waitForSelector('tbody tr', { timeout: 10000 });

    const guideBtn = page.getByRole('button', { name: 'Status color guide' });
    await guideBtn.click();
    await expect(page.getByText('Status dot guide')).toBeVisible();
    await expect(page.getByText(/Left dot \(Scan\)/i)).toBeVisible();

    await page.locator('body').click({ position: { x: 4, y: 4 } });
    await expect(page.getByText('Status dot guide')).toBeHidden();
  });

  test('tag bookmark filter renders rows when API total > 0', async ({ page, request }) => {
    const res = await request.get('/api/movies?tags=p1&page=1&limit=50');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(typeof json.total).toBe('number');
    if (json.total > 0) {
      await page.goto('/library?tags=p1&page=1');
      await page.waitForSelector('tbody tr', { timeout: 10000 });
      await expect(page.locator('tbody tr').first()).toBeVisible();
    }
  });

  test('API-vs-UI row parity across broad filter matrix', async ({ page, request }) => {
    const tagsRes = await request.get('/api/movies/tags');
    const tagsJson = await tagsRes.json();
    const allTags = Array.isArray(tagsJson?.tags) ? tagsJson.tags : [];
    const chosenTag = allTags.includes('p1') ? 'p1' : (allTags[0] ?? '');

    const genresRes = await request.get('/api/movies/genres');
    const genresJson = await genresRes.json();
    const chosenGenre = Array.isArray(genresJson?.genres) ? (genresJson.genres[0] ?? '') : '';

    const matrix = [
      { label: 'tag-filter', pageParams: { tags: chosenTag, page: '1' } },
      { label: 'av1-compat', pageParams: { av1Compat: '1', page: '1' } },
      { label: 'multi-only', pageParams: { multi: '1', page: '1' } },
      { label: 'nojf-only', pageParams: { noJf: '1', page: '1' } },
      {
        label: 'video-combo',
        pageParams: { page: '1', limit: '100', resolution: '2160p', hdr: '1', dv: '1', legacy: '1' },
      },
      { label: 'audio-format-ddp', pageParams: { page: '1', audioFormat: 'ddp' } },
      { label: 'audio-layout-5.1', pageParams: { page: '1', audioLayout: '5.1' } },
      { label: 'genre-filter', pageParams: { page: '1', genre: chosenGenre } },
      { label: 'tag-plus-multi', pageParams: { page: '1', tags: chosenTag, multi: '1' } },
    ];

    for (const m of matrix) {
      if (m.pageParams.tags === '' || m.pageParams.genre === '') continue;
      await assertLibraryParity(page, request, m.pageParams, m.label);
    }
  });
});

test.describe('Scout / Disambiguate / Verify / Settings', () => {
  test('scout loads', async ({ page }) => {
    await page.goto('/scout');
    await expect(page.getByRole('heading', { name: 'Scout Queue' })).toBeVisible();
  });

  test('disambiguate loads', async ({ page }) => {
    await page.goto('/disambiguate');
    await expect(page.getByRole('heading', { name: 'Disambiguate' })).toBeVisible();
    await expect(page.getByText('Folder Naming Support')).toBeVisible();
    await expect(
      page.getByText('Rename folder to match Jellyfin title/year or adjust Jellyfin metadata, then click Refresh.'),
    ).toBeVisible();
  });

  test('verify loads', async ({ page }) => {
    await page.goto('/verify');
    await expect(page.getByRole('heading', { name: 'Deep Verify' })).toBeVisible();
  });

  test('settings loads', async ({ page }) => {
    await page.goto('/settings/general');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Jellyfin Connection')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('scout settings loads', async ({ page }) => {
    await page.goto('/settings/scout');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Scout Quality Pipeline/i })).toBeVisible();
    await expect(page.getByText(/Final LLM ruleset/i).first()).toBeVisible();
    await expect(page.getByText(/New installs start with 2 disabled examples/i)).toBeVisible();
    await expect(page.getByText('Source', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Usenet Bonus').first()).toBeVisible();
    await expect(page.getByText('Torrent Bonus').first()).toBeVisible();
    await expect(page.getByText('TRaSH Baseline (Read-only)').first()).toBeVisible();
    await expect(page.getByText('Declarative Mapping Set')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByText('Max Resolution')).toHaveCount(0);
  });

  test('scout settings custom CF save shows success', async ({ page, request }) => {
    test.setTimeout(90_000);
    const ruleName = `UI E2E CF ${Date.now()}`;
    await page.goto('/settings/scout');

    const customSection = page
      .locator('section')
      .filter({ hasText: 'Additional Custom Format Scores & Blocking Rules' })
      .first();
    if ((await customSection.locator('input[placeholder="Rule name"]').count()) === 0) {
      await customSection.getByRole('button', { name: 'Add Rule' }).first().click();
    }
    await customSection.locator('input[placeholder="Rule name"]').first().fill(ruleName);
    await customSection.locator('input[placeholder="\\\\bframestor\\\\b"]').first().fill('\\bUIE2ETEST\\b');
    await customSection.locator('input[placeholder="score"]').first().fill('9');

    await customSection.getByRole('button', { name: 'Save Custom CF Rules' }).click();
    await expect(customSection.getByText('Saved')).toBeVisible();

    const list = await request.get('/api/scout/rules?category=scout_custom_cf');
    const body = await list.json();
    const rows = body?.rules?.scout_custom_cf ?? [];
    const created = rows.find((r) => r.name === ruleName);
    expect(Boolean(created)).toBeTruthy();
    expect(created.enabled).toBe(1);

    // Cleanup created sample rule from this UI test.
    const cleanup = await request.put('/api/scout/rules/replace-category', {
      data: { category: 'scout_custom_cf', rules: [] },
    });
    expect(cleanup.ok()).toBeTruthy();
  });

  test('scan page jellyfin sync tooltip renders rich content', async ({ page }) => {
    await page.goto('/scan');
    const hint = page.getByRole('button', { name: 'How Jellyfin sync works' }).first();
    await hint.click();
    await expect(page.getByText('Jellyfin Sync - how it works')).toBeVisible();
    await expect(page.getByText('Fetches your entire movie library from Jellyfin')).toBeVisible();
  });

  test('scan page history includes Result column when runs exist', async ({ page, request }) => {
    const res = await request.get('/api/scan/history');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const runs = Array.isArray(json?.runs) ? json.runs : [];

    await page.goto('/scan');
    if (runs.length > 0) {
      await page.waitForResponse((r) => r.url().includes('/api/scan/history') && r.ok());
      await expect(page.getByText('Scan History')).toBeVisible();
      await expect(page.locator('thead th', { hasText: 'Result' })).toBeVisible();
    }
  });
});

test.describe('MoviePage', () => {
  test('opens by direct movie route', async ({ page, request }) => {
    const res = await request.get('/api/movies?limit=1&page=1');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const id = Number(json?.movies?.[0]?.id);
    expect(Number.isFinite(id) && id > 0).toBeTruthy();
    await page.goto(`/movies/${id}`);
    const bodyText = await page.textContent('body');
    expect(bodyText && bodyText.length > 0).toBeTruthy();
    expect(/Sync from Jellyfin|Movie not found|Library/i.test(bodyText ?? '')).toBeTruthy();
  });

  test('shows explicit ratings labels on detail page', async ({ page, request }) => {
    const res = await request.get('/api/movies?limit=1&page=1');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const id = Number(json?.movies?.[0]?.id);
    expect(Number.isFinite(id) && id > 0).toBeTruthy();
    await page.goto(`/movies/${id}`);
    await expect(page.getByText('IMDb rating:')).toBeVisible();
    await expect(page.getByText(/Jellyfin critic score/i)).toBeVisible();
  });

  test('has primary scout action and scout section below notes/tags', async ({ page, request }) => {
    const res = await request.get('/api/movies?limit=1&page=1');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const id = Number(json?.movies?.[0]?.id);
    expect(Number.isFinite(id) && id > 0).toBeTruthy();
    await page.goto(`/movies/${id}`);

    await expect(page.getByTestId('movie-actions-row')).toBeVisible();
    await expect(page.getByTestId('movie-actions-row').getByRole('button', { name: 'Scout Releases' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sync from Jellyfin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(page.getByTestId('movie-scout-section')).toHaveCount(0);

    await expect(page.getByText('Notes', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('movie-actions-row')).toBeVisible();
  });

  test('top scout action runs search and keeps scout section visible', async ({ page, request }) => {
    const res = await request.get('/api/movies?limit=1&page=1');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const id = Number(json?.movies?.[0]?.id);
    expect(Number.isFinite(id) && id > 0).toBeTruthy();
    await page.goto(`/movies/${id}`);

    const topScoutBtn = page.getByTestId('movie-actions-row').getByRole('button', { name: 'Scout Releases' });
    await expect(topScoutBtn).toBeVisible();
    await topScoutBtn.click();

    await expect(page.getByTestId('movie-scout-section')).toBeVisible();
    await expect(
      page.getByTestId('movie-scout-section').getByRole('button', { name: 'Force Refresh Results' }),
    ).toBeVisible();
  });
});

test.describe('API sanity', () => {
  test('stats endpoint', async ({ request }) => {
    const res = await request.get('/api/stats');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(typeof json.totalMovies).toBe('number');
    expect(typeof json.codecDist).toBe('object');
  });

  test('movies endpoint responds with list', async ({ request }) => {
    const res = await request.get('/api/movies?limit=5&page=1');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.movies)).toBeTruthy();
  });

  test('cache headers are correct for HTML shell and hashed assets', async ({ request }) => {
    const htmlRes = await request.get('/library');
    expect(htmlRes.ok()).toBeTruthy();
    const htmlCache = htmlRes.headers()['cache-control'] ?? '';
    expect(htmlCache).toContain('no-store');

    const html = await htmlRes.text();
    const assetMatch = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
    expect(assetMatch).toBeTruthy();
    const assetPath = `/${assetMatch[0]}`;

    const assetRes = await request.get(assetPath);
    expect(assetRes.ok()).toBeTruthy();
    const assetCache = assetRes.headers()['cache-control'] ?? '';
    expect(assetCache).toContain('immutable');
    expect(assetCache).toContain('max-age');
  });

  test('scan history API is capped at 200 rows', async ({ request }) => {
    const res = await request.get('/api/scan/history');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(Array.isArray(json.runs)).toBeTruthy();
    expect(json.runs.length).toBeLessThanOrEqual(200);
  });
});
