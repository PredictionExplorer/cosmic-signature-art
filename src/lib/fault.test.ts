import { describe, expect, it, vi } from 'vitest';
import { faultReference, isMissingScript, tryAgain } from './fault';

/** An error as each bundler and engine names a file of script that did not arrive. */
const missing = () => {
  const turbopack = new Error('Failed to load chunk /_next/static/chunks/0abc.js from module 71');
  turbopack.name = 'ChunkLoadError';
  return [
    turbopack,
    Object.assign(new Error('Loading chunk 482 failed.'), { name: 'ChunkLoadError' }),
    new TypeError('Failed to fetch dynamically imported module: https://cosmic.art/_next/x.js'),
    new TypeError('error loading dynamically imported module'),
    new TypeError('Importing a module script failed.'),
  ];
};

describe('a file of script that did not arrive', () => {
  it('is told by the bundler’s name for it, or by an engine’s words', () => {
    for (const error of missing()) expect(isMissingScript(error), error.message).toBe(true);
  });

  it('is not any other fault, nor a thing thrown that is no error', () => {
    for (const other of [
      new Error('The record could not be read.'),
      new TypeError("Cannot read properties of undefined (reading 'media')"),
      'ChunkLoadError',
      { name: 'ChunkLoadError' },
      null,
      undefined,
    ])
      expect(isMissingScript(other)).toBe(false);
  });
});

describe('trying again', () => {
  it('asks for the route’s data and its render once more', () => {
    const retry = vi.fn();
    const reload = vi.fn();
    tryAgain(new Error('The record could not be read.'), retry, reload);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('loads the page afresh for a missing file, which rendering again would only ask for again', () => {
    for (const error of missing()) {
      const retry = vi.fn();
      const reload = vi.fn();
      tryAgain(error, retry, reload);
      expect(reload, error.message).toHaveBeenCalledTimes(1);
      expect(retry, error.message).not.toHaveBeenCalled();
    }
  });
});

describe('the server’s reference for a fault', () => {
  it('is the digest Next sends in place of the server’s message', () => {
    expect(
      faultReference(Object.assign(new Error('An error occurred.'), { digest: '3894567123' })),
    ).toBe('3894567123');
    expect(faultReference({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBeUndefined();
  });

  it('is nothing for a fault met in the browser, or a digest that is no short token', () => {
    for (const none of [
      new Error('thrown in the browser'),
      Object.assign(new Error('x'), { digest: 42 }),
      Object.assign(new Error('x'), { digest: '' }),
      Object.assign(new Error('x'), { digest: '<img src=x onerror=alert(1)>' }),
      Object.assign(new Error('x'), { digest: 'a'.repeat(65) }),
      'a string',
      null,
    ])
      expect(faultReference(none)).toBeUndefined();
  });
});
