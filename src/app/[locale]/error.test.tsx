import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogs } from '@/lib/i18n/messages';
import { words } from '@/lib/i18n/words';
import ErrorPage from './error';
import { ErrorWords } from './error-context';
import { ERROR_PAGE_WORDS } from './error.words';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the venue’s error page', () => {
  it('says that a page failed in the words the document provides, and its word tries again', () => {
    const uk = catalogs.uk;
    const reset = vi.fn();
    render(
      <ErrorWords t={words(uk, ERROR_PAGE_WORDS)}>
        <ErrorPage error={new Error('The page failed.')} reset={reset} />
      </ErrorWords>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(uk.errorTitle);
    fireEvent.click(screen.getByRole('button', { name: uk.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
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
      render(<ErrorPage error={new Error('The page failed.')} reset={() => {}} />),
    ).toThrow(/outside the venue document/);
  });
});
