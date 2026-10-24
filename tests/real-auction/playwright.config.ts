import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.',
  testMatch: 'lifecycle.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(
          new URL('../../test-results/real-auction-results.json', import.meta.url),
        ),
      },
    ],
  ],
  outputDir: '../../test-results/real-auction',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --config tests/real-auction/vite.config.ts',
    cwd: new URL('../..', import.meta.url).pathname,
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
