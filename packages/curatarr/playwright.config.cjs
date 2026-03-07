// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.CURATARR_BASE_URL || 'http://localhost:3270';
const workerOverride = Number(process.env.PW_E2E_WORKERS || 1);
const workers = Number.isFinite(workerOverride) && workerOverride > 0 ? workerOverride : 1;

module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.cjs',
  outputDir: './test/results',
  workers,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'line',
  use: {
    baseURL,
    headless: true,
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Don't start a web server — assume it's already running
  webServer: undefined,
});
