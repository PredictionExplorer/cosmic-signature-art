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
// jsdom has no canvas either; a context request answers null, as in a browser without one,
// so the crossing keeps the straight seam and the orbit's drawing rests on its record.
if (typeof HTMLCanvasElement !== 'undefined')
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => null,
  });
afterEach(cleanup);
