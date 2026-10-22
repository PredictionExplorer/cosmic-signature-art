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
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
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
