/**
 * Curatarr UI smoke tests — Playwright
 * Run: npm run test:e2e
 */

// @ts-check
const { test, expect } = require('@playwright/test');

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
    await expect(page.getByText(/Left dot \(scan\):/)).toBeVisible();

    await page.locator('body').click({ position: { x: 4, y: 4 } });
    await expect(page.getByText('Status dot guide')).toBeHidden();
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
  });

  test('verify loads', async ({ page }) => {
    await page.goto('/verify');
    await expect(page.getByRole('heading', { name: 'Deep Verify' })).toBeVisible();
  });

  test('settings loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Jellyfin Connection')).toBeVisible();
  });

  test('scan page jellyfin sync tooltip renders rich content', async ({ page }) => {
    await page.goto('/scan');
    const hint = page.getByRole('button', { name: 'How Jellyfin sync works' }).first();
    await hint.click();
    await expect(page.getByText('Jellyfin Sync — how it works')).toBeVisible();
    await expect(page.getByText('Fetches your entire movie library from Jellyfin')).toBeVisible();
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
    expect(/Refresh Jellyfin|Movie not found|Library/i.test(bodyText ?? '')).toBeTruthy();
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
});
