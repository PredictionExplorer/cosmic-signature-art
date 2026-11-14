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
      // The orbit section's hooks and performers are plain .ts beside their components.
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx', 'src/components/orbit-*.ts'],
      exclude: ['**/*.test.*'],
      thresholds: {
        lines: 75,
        branches: 65,
        'src/lib/auction/rules.ts': { 100: true },
        'src/lib/auction/client.ts': { lines: 95, branches: 90, functions: 90 },
        'src/components/live-auction.tsx': { lines: 90, branches: 80 },
        'src/lib/art/media.ts': { lines: 95, branches: 90 },
      },
    },
  },
});
