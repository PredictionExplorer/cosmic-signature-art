import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { CJK_STYLESHEETS } from '@/lib/fonts';
import { catalogs } from '@/lib/i18n/messages';
import { locales, localizedPath } from '@/lib/i18n/routing';
import GlobalError from './global-error';
import { GLOBAL_ERROR_WORDS } from './global-error.words';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

afterEach(() => {
  vi.mocked(usePathname).mockReset();
});

/**
 * The page as it is sent when the document has failed, at an address, read as a document of
 * its own. (The matchers of this suite's own document refuse another's nodes, so these read
 * attributes and text as they are.)
 */
function page(pathname: string | null, error: unknown = new Error('The document failed.')) {
  vi.mocked(usePathname).mockReturnValue(pathname as string);
  return new DOMParser().parseFromString(
    `<!doctype html>${renderToStaticMarkup(<GlobalError error={error} retry={() => {}} />)}`,
    'text/html',
  );
}
const text = (sent: Document, selector: string) => sent.querySelector(selector)?.textContent;

describe('the venue’s last page, for a document that failed', () => {
  it.each(locales)('speaks %s at an address of that language', (locale) => {
    const t = catalogs[locale];
    const sent = page(localizedPath(locale, '/art/31'));
    expect(sent.documentElement.lang).toBe(locale);
    expect(text(sent, 'main#main h1')).toBe(t.errorTitle);
    expect(text(sent, 'main button')).toBe(t.retry);
    expect(sent.title).toBe(`${t.errorTitle} · Cosmic Signature`);
    // The way home loads a new document: a plain link, to the home in this language.
    expect(sent.querySelector('header a.brand')?.getAttribute('href')).toBe(localizedPath(locale));
    // A CJK locale's own face is linked here too: this page may be all that was sent.
    expect(sent.querySelector('link[rel="stylesheet"]')?.getAttribute('href') ?? undefined).toBe(
      CJK_STYLESHEETS[locale],
    );
  });

  it('holds each language’s line and word to its catalog', () => {
    // The page cannot be handed its words (global-error.words.ts says why), so they are
    // written out there, and this is what keeps them the catalog's own.
    expect(GLOBAL_ERROR_WORDS).toEqual(
      Object.fromEntries(
        locales.map((locale) => [
          locale,
          { errorTitle: catalogs[locale].errorTitle, retry: catalogs[locale].retry },
        ]),
      ),
    );
  });

  it.each([null, '/', '/art/31', '/nowhere/at/all', '/english'])(
    'is English where the address names no language (%s)',
    (pathname) => {
      const sent = page(pathname);
      expect(sent.documentElement.lang).toBe('en');
      expect(text(sent, 'h1')).toBe(catalogs.en.errorTitle);
    },
  );

  it('stands on paper, with the venue’s own frame and one main', () => {
    const sent = page('/ja/process');
    expect(sent.documentElement.dataset.room).toBe('paper');
    expect(sent.querySelectorAll('main')).toHaveLength(1);
    expect(sent.querySelector('.site > header.site-header')).not.toBeNull();
  });

  it('shows the server’s reference when the fault was the server’s, and never its message', () => {
    const sent = page(
      '/uk',
      Object.assign(new Error('An error occurred in the Server Components render.'), {
        digest: '1048576001',
      }),
    );
    expect(text(sent, '[data-fault-reference]')).toBe('1048576001');
    expect(sent.querySelector('[data-fault-reference]')?.getAttribute('translate')).toBe('no');
    expect(sent.body.textContent).not.toMatch(/Server Components/);
    expect(page('/uk').querySelector('[data-fault-reference]')).toBeNull();
  });
});

describe('its word', () => {
  it('hands the fault and Next’s retry to the same judge as a route’s error page', async () => {
    vi.resetModules();
    const tryAgain = vi.fn();
    vi.doMock('@/lib/fault', async (original) => ({
      ...(await original<typeof import('@/lib/fault')>()),
      tryAgain,
    }));
    vi.doMock('next/navigation', () => ({ usePathname: () => '/ko/collection' }));
    const { default: Page } = await import('./global-error');
    const { createRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const error = new Error('The document failed.');
    const retry = vi.fn();
    // React renders an <html> into the document itself, as Next does with this page.
    const root = createRoot(document);
    await act(async () => root.render(<Page error={error} retry={retry} />));
    const button = document.querySelector('main button') as HTMLButtonElement;
    expect(button.textContent).toBe(catalogs.ko.retry);
    await act(async () => button.click());
    expect(tryAgain).toHaveBeenCalledWith(error, retry);
    await act(async () => root.unmount());
    vi.doUnmock('@/lib/fault');
    vi.doUnmock('next/navigation');
  });
});
