import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogs } from '@/lib/i18n/messages';
import { words } from '@/lib/i18n/words';
import { tryAgain } from '@/lib/fault';
import ErrorPage from './error';
import { ErrorWords } from './error-context';
import { ERROR_PAGE_WORDS } from './error.words';

// What "Try again" does with each kind of fault is held in src/lib/fault.test.ts; here, that
// the page hands it the very error and the very retry Next gave it.
vi.mock('@/lib/fault', async (original) => ({
  ...(await original<typeof import('@/lib/fault')>()),
  tryAgain: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(tryAgain).mockClear();
});

const uk = catalogs.uk;
const page = (error: unknown, retry = vi.fn()) =>
  render(
    <ErrorWords t={words(uk, ERROR_PAGE_WORDS)}>
      <ErrorPage error={error} retry={retry} />
    </ErrorWords>,
  );

describe('the venue’s error page', () => {
  it('says that a page failed in the words the document provides, and its word tries again', () => {
    const error = new Error('The page failed.');
    const retry = vi.fn();
    page(error, retry);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(uk.errorTitle);
    fireEvent.click(screen.getByRole('button', { name: uk.retry }));
    // The route's data is asked for again (Next's retry), never only the same render (reset).
    expect(tryAgain).toHaveBeenCalledTimes(1);
    expect(tryAgain).toHaveBeenCalledWith(error, retry);
  });

  it('shows the server’s reference for a fault the server met, and nothing of its message', () => {
    const { container } = page(
      Object.assign(new Error('An error occurred in the Server Components render.'), {
        digest: '2947104385',
      }),
    );
    const reference = container.querySelector('[data-fault-reference]');
    expect(reference).toHaveTextContent(/^2947104385$/);
    // A reference is no word of any language.
    expect(reference).toHaveAttribute('translate', 'no');
    expect(container).not.toHaveTextContent(/Server Components/);
  });

  it('shows no reference for a fault met in the browser, which has none', () => {
    const { container } = page(new TypeError('thrown in the browser'));
    expect(container.querySelector('[data-fault-reference]')).toBeNull();
    expect(container).not.toHaveTextContent(/thrown in the browser/);
  });

  it('stands for a thing thrown that is no error at all', () => {
    page('a string was thrown');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(uk.errorTitle);
  });

  it('is handed its two strings and none of the rest of the catalog', () => {
    expect(words(catalogs.ja, ERROR_PAGE_WORDS)).toEqual({
      errorTitle: catalogs.ja.errorTitle,
      retry: catalogs.ja.retry,
    });
  });

  it('refuses to stand outside the document that has its words', () => {
    // React reports the throw; it is this test's own.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<ErrorPage error={new Error('The page failed.')} retry={() => {}} />),
    ).toThrow(/outside the venue document/);
  });
});
