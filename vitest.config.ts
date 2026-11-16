import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // A test's budget is there to catch a hang. CI's shared runner, measuring coverage, takes four
    // to five times as long over this suite as a developer's machine, so its budget is sized to
    // the runner rather than left at the five seconds meant for a laptop. The physics tests keep
    // their own, longer budgets.
    testTimeout: process.env.CI ? 15_000 : 5_000,
    coverage: {
      provider: 'v8',
      // All of the venue's source, so a file no test loads is reported at nothing and counts.
      // The list was once the library and the components by name, which left the routes, the
      // proxy and the plain .ts engines beside the components out of the report altogether.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      thresholds: {
        // Floors a few points under what the suite reaches, so that losing a test file shows.
        // Measured on 16 November 2026 over all of src: lines 93.8, statements 92.1, functions
        // 90.9, branches 84.9. The floors were 75 and 65, over the narrower list. Raise them
        // as the figures rise; a floor only ever goes down with its reason beside it.
        lines: 91,
        statements: 89,
        functions: 88,
        branches: 82,
        'src/lib/auction/rules.ts': { 100: true },
        'src/lib/auction/client.ts': { lines: 95, branches: 90, functions: 90 },
        'src/components/live-auction.tsx': { lines: 90, branches: 80 },
        'src/lib/art/media.ts': { lines: 95, branches: 90 },
      },
    },
  },
});
