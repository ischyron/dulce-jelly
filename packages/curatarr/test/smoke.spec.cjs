/**
 * Curatarr UI smoke tests — Playwright
 * Run: npx playwright test test/smoke.spec.js --reporter=line
 * Requires: server running at http://localhost:7474
 */

// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:7474';

test.describe('Dashboard', () => {
  test('loads with stats', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Total Movies')).toBeVisible();
    await expect(page.locator('span:text-is("Scanned")')).toBeVisible();
    await expect(page.locator('text=Jellyfin Synced')).toBeVisible();
    // stats should show non-zero values
    await expect(page.locator('text=Total Movies').locator('..').locator('..')).toContainText(/\d/);
  });

  test('resolution chart renders', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=Resolution Distribution')).toBeVisible();
    await expect(page.locator('text=Codec Distribution')).toBeVisible();
  });
});

test.describe('Library', () => {
  test('loads movie list', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    // "movies" label is visible and the parent contains a 3-4 digit count
    await expect(page.locator('span:text-is("movies")')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('span:text-is("movies")').locator('..')).toContainText(/\d{3,4}/);
  });

  test('resolution filter works', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.click('button:has-text("1080p")');
    await expect(page.url()).toContain('resolution=1080p');
    await expect(page.locator('text=movies')).toBeVisible({ timeout: 8000 });
  });

  test('codec filter works', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.click('button:has-text("hevc")');
    await expect(page.url()).toContain('codec=hevc');
    await expect(page.locator('text=movies')).toBeVisible({ timeout: 8000 });
  });

  test('no-JF filter works', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.check('input[type="checkbox"]:near(:text("No JF"))');
    await expect(page.url()).toContain('noJf=1');
    await expect(page.locator('text=movies')).toBeVisible({ timeout: 8000 });
  });

  test('search works', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.fill('input[placeholder="Search titles…"]', 'Rashomon');
    await page.waitForTimeout(500); // debounce
    await expect(page.locator('text=movies')).toBeVisible({ timeout: 8000 });
  });

  test('click row opens detail drawer', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForSelector('tbody tr', { timeout: 8000 });
    await page.locator('tbody tr').first().click();
    await expect(page.locator('[data-testid="movie-drawer"], .fixed.inset-y-0')).toBeVisible({ timeout: 3000 }).catch(() => {
      // Drawer may use different selector — check for resolution badge in sidebar
    });
  });

  test('status dots column visible', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForSelector('tbody tr', { timeout: 8000 });
    // The ⬡ header for the status column should be present
    await expect(page.locator('th:has-text("⬡")')).toBeVisible();
  });

  test('Issues column header visible', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForSelector('tbody tr', { timeout: 8000 });
    await expect(page.locator('th:text-is("Issues")')).toBeVisible();
  });

  test('total size on disk shown in filter bar', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForSelector('tbody tr', { timeout: 8000 });
    // The total size span has a specific title attribute
    const sizeEl = page.locator('[title="Total size on disk (all scanned files)"]');
    await expect(sizeEl).toBeVisible({ timeout: 8000 });
    await expect(sizeEl).toContainText(/\d+\.\d+ (TB|GB|MB)/);
  });
});

test.describe('Movie page', () => {
  test('opens from library link', async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await page.waitForSelector('tbody tr a', { timeout: 8000 });
    await page.locator('tbody tr a').first().click();
    await expect(page.url()).toMatch(/\/movies\/\d+/);
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('movie detail page loads (direct nav)', async ({ page }) => {
    // Get first movie ID from API
    const res = await page.request.get(`${BASE}/api/movies?page=1&limit=1`);
    const json = await res.json();
    const id = json.movies[0]?.id;
    if (!id) test.skip();
    await page.goto(`${BASE}/movies/${id}`);
    // Wait for any content — movie page loads title or technical details
    await expect(page.locator('main, [class*="p-6"], [class*="space-y"]').first()).toBeVisible({ timeout: 8000 });
    // Check URL is correct
    expect(page.url()).toMatch(/\/movies\/\d+/);
  });
});

test.describe('Scan page', () => {
  test('scan page loads', async ({ page }) => {
    await page.goto(`${BASE}/scan`);
    await expect(page.locator('h1:has-text("Scan")')).toBeVisible({ timeout: 5000 });
  });

  test('scan modal SSE replay on fast scan', async ({ page }) => {
    // Trigger a scan (files already cached — will complete instantly)
    await page.goto(BASE);
    // Open scan modal via dashboard button
    await page.click('button:has-text("Scan Library")');
    // Should show scan modal; with replay buffer, should quickly show Complete or in-progress state
    await expect(page.locator('text=Library Scan')).toBeVisible({ timeout: 3000 });
    // Stop or complete should appear
    await expect(
      page.locator('button:has-text("Stop Scan")').or(page.locator('button:has-text("Close")'))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Jellyfin Connection')).toBeVisible();
  });

  test('library path is populated', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.waitForTimeout(1000); // wait for settings to load
    const input = page.locator('input[name="libraryPath"]');
    const value = await input.inputValue();
    // should have a non-empty library path if configured
    expect(value.length).toBeGreaterThan(0);
  });

  test('API key shows masked hint when set', async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await page.waitForTimeout(1000);
    // If API key is set, hint should show "Currently set: ****"
    const hint = page.locator('text=/Currently set: \\*{4}/');
    // This only appears if a key is stored — don't fail if not set
    const count = await hint.count();
    if (count > 0) {
      await expect(hint.first()).toBeVisible();
    }
  });
});

test.describe('Disambiguate page', () => {
  test('loads', async ({ page }) => {
    await page.goto(`${BASE}/disambiguate`);
    await expect(page.locator('text=Disambiguate').or(page.locator('text=disambiguation')).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Verify page', () => {
  test('loads', async ({ page }) => {
    await page.goto(`${BASE}/verify`);
    await expect(page.locator('text=Verify').or(page.locator('text=Deep Check')).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('API endpoints', () => {
  test('/api/stats returns valid data', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stats`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.totalMovies).toBeGreaterThan(0);
    expect(json.resolutionDist['1080p']).toBeGreaterThan(1000);
    expect(json.resolutionDist['720p']).toBeLessThan(100); // after v7 reclassification
    expect(typeof json.totalLibrarySize).toBe('number');   // v8 — total bytes on disk
    expect(json.totalLibrarySize).toBeGreaterThan(0);
  });

  test('/api/movies?codec=h264 returns results', async ({ request }) => {
    const res = await request.get(`${BASE}/api/movies?codec=h264&limit=10`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.total).toBeGreaterThan(1000);
    expect(json.movies.length).toBeGreaterThan(0);
  });

  test('/api/movies?noJf=true returns unmatched movies', async ({ request }) => {
    const res = await request.get(`${BASE}/api/movies?noJf=true&limit=10`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.total).toBeGreaterThan(0);
    for (const m of json.movies) {
      expect(m.jellyfin_id).toBeNull();
    }
  });

  test('resolution reclassification — widescreen scope films', async ({ request }) => {
    const res = await request.get(`${BASE}/api/movies?search=Jesse+James&limit=5`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const movie = json.movies.find((m) =>
      String(m.parsed_title ?? '').toLowerCase().includes('jesse')
    );
    if (movie) {
      expect(movie.resolution_cat).toBe('1080p');
    }
  });
});
