/*
  A golden master of the orbit section, for a change that must alter nothing a visitor meets.

  It runs src/components/orbit-score.test.tsx as it stands, with a recorder added on the way in
  (the file on disk is not touched). For each test it keeps, in order: every call and every
  property set on the mocked canvas; every change of the page; and, at the end, the focus, the
  scrolls and the page itself. Record before the change, and compare after it:

    GOLDEN_OUT=.golden/before npm run test:golden
    GOLDEN_OUT=.golden/after GOLDEN_BASE=.golden/before npm run test:golden

  The second run fails, naming each test, unless every log is identical. Where calls were taken
  out on purpose, `npm run test:golden:removed -- .golden/before .golden/after` says whether the
  new recording is the old with lines removed and nothing else moved, and which lines.

  The section was parted this way (docs/after-the-frame.md §8.5): about 19 million lines,
  identical through thirteen steps.
*/
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const RECORDED = '/src/components/orbit-score.test.tsx';

/** The three places the section's test meets the recorder, each found exactly once. */
const SEAMS: [from: string, to: string][] = [
  [
    'calls.push({ name: String(property), args });',
    'calls.push({ name: String(property), args }); __golden.call(String(property), args);',
  ],
  [
    'set: () => true,',
    'set: (_, property, value) => { __golden.set(String(property), value); return true; },',
  ],
  [
    'afterEach(() => {\n  cleanup();',
    'afterEach(() => {\n  __golden.finish(scrolled);\n  cleanup();',
  ],
];

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'golden-recorder',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith(RECORDED)) return null;
        let recorded = code;
        for (const [from, to] of SEAMS) {
          if (recorded.split(from).length !== 2)
            throw new Error(`golden: the test no longer has, once, the line: ${from}`);
          recorded = recorded.replace(from, to);
        }
        return { code: recorded, map: null };
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: {
    root: fileURLToPath(new URL('../..', import.meta.url)),
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts', './tests/golden/recorder.ts'],
    include: [RECORDED.slice(1)],
    testTimeout: 30_000,
  },
});
