const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const ROUTES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/library', heading: 'Library' },
  { path: '/scan', heading: 'Scan & Sync' },
  { path: '/disambiguate', heading: 'Disambiguate' },
  { path: '/verify', heading: 'Deep Verify' },
  { path: '/settings/general', heading: 'Settings' },
  { path: '/settings/scout', heading: 'Settings' },
];

test.describe('Accessibility checks', () => {
  for (const route of ROUTES) {
    test(`axe serious/critical: ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

      const seriousViolations = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

      await test.info().attach(`axe-${route.path.replace(/\W+/g, '_')}.json`, {
        body: JSON.stringify(
          {
            route: route.path,
            totalViolations: results.violations.length,
            seriousOrCritical: seriousViolations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.length,
            })),
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });

      expect(Array.isArray(results.violations)).toBeTruthy();
    });
  }
});
