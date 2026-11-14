import { defineConfig } from '@playwright/test';
import { OVERTURE_KEY } from './src/lib/storage-keys';
import { VENUE_DATE } from './tests/e2e/venue-day';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4318';
// The suite's own arithmetic (the day's work, its expression) runs on the server's pinned day,
// in every worker, however the suite is started.
process.env.COSMIC_VENUE_DATE ??= VENUE_DATE;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: true,
  // A test.only left in by mistake would have CI run that one test and pass: it fails there.
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  // A reused server must be on the suite's venue day; this says so before any test runs.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL,
    // The suite meets the venue as a returning visitor: the Overture plays once a browser, and
    // its own spec starts afresh to meet it (tests/e2e/overture.spec.ts).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: OVERTURE_KEY, value: 'seen' }],
        },
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: { COSMIC_VENUE_DATE: VENUE_DATE },
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'firefox-desktop',
      use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'webkit-desktop',
      use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'webkit-mobile',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'chromium-reduced-motion',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'webkit-reduced-motion',
      use: {
        browserName: 'webkit',
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      },
    },
  ],
});
