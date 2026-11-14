import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Two clocks. The contract's countdown is the only hh:mm:ss on the site and the only
 * one-second timer besides the lot freshness check; every other time the venue shows
 * is a calendar date and time. These rules keep a second ticking clock from arriving:
 * a setInterval delay must be a literal above 1000 so the rule can read it, and the
 * countdown formatter cannot be reached by any import spelling or a dynamic import.
 */
const countdownMessage =
  "The contract's clock is the only hh:mm:ss on the site. Import '@/lib/auction/countdown' from src/components/live-auction.tsx alone; every other time is a calendar date and time, never a ticking clock.";
const intervalMessage =
  "A one-second clock belongs to the contract's countdown (src/components/live-auction.tsx) and the lot freshness check (src/components/auction-gallery.tsx) only. Site-authored times are calendar dates; do not add another ticking clock. Write the delay as a literal above 1000 so this rule can read it.";
const oneSecondInterval = [
  "CallExpression[callee.name='setInterval'][arguments.1.value<=1000]",
  "CallExpression[callee.property.name='setInterval'][arguments.1.value<=1000]",
  "CallExpression[callee.name='setInterval']:not([arguments.1.type='Literal'])",
  "CallExpression[callee.property.name='setInterval']:not([arguments.1.type='Literal'])",
].join(', ');
const countdownDynamicImport =
  'ImportExpression[source.value=/(^|\\/)countdown(\\.[cm]?[jt]sx?)?$/]';
const countdownImportPattern =
  '(^|/)auction/countdown(\\.[cm]?[jt]sx?)?$|^\\.{1,2}/countdown(\\.[cm]?[jt]sx?)?$';
/**
 * The browsers the venue supports are named once, in package.json ("browserslist"), and the type
 * library stops at the language they all have (tsconfig.json, "lib"). The DOM's types carry no
 * dates, so a call that arrived later compiles: AbortSignal.any did, and in Chrome before 116,
 * Firefox before 124 and Safari before 17.4 it is not a function. No lint plugin tried reports
 * it, so the one known trap is named here, with the way round it.
 */
const abortSignalAnyMessage =
  'AbortSignal.any is newer than the browsers the venue supports (package.json, "browserslist"). Link the signals with withDeadline (src/lib/abort.ts).';
/**
 * The browser suite's `test` listens for the page's faults (tests/e2e/fixtures.ts). A spec that
 * took Playwright's own would run, and pass, with nobody listening.
 */
const suiteTestMessage =
  "Import `test` from './fixtures' (tests/e2e/fixtures.ts), not from Playwright: the suite's own fails a test whose page threw, logged an error or was answered a 5xx.";

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.next-*/**',
      'concepts/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', URL: 'readonly' } } },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'scripts/**/*.{mjs,ts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: countdownImportPattern, message: countdownMessage }] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: oneSecondInterval, message: intervalMessage },
        { selector: countdownDynamicImport, message: countdownMessage },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'AbortSignal', property: 'any', message: abortSignalAnyMessage },
      ],
    },
  },
  {
    // A later setting of a rule replaces an earlier one, so the countdown's pattern is said again.
    files: ['tests/e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@playwright/test', importNames: ['test'], message: suiteTestMessage }],
          patterns: [{ regex: countdownImportPattern, message: countdownMessage }],
        },
      ],
    },
  },
  {
    files: ['src/components/live-auction.tsx', 'src/lib/auction/countdown.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/components/live-auction.tsx', 'src/components/auction-gallery.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
