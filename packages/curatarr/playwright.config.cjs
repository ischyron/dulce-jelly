// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.CURATARR_BASE_URL || 'http://localhost:3270';

module.exports = defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.cjs',
  outputDir: './test/results',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: 'line',
  use: {
    baseURL,
    headless: true,
    video: 'off',
    screenshot: 'only-on-failure',
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
