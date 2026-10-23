import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
// jsdom has no media decoder; individual tests can still spy on resource releases.
// Production browser suites exercise actual source loading and cancellation.
if (typeof HTMLMediaElement !== 'undefined')
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: () => {},
  });
afterEach(cleanup);
