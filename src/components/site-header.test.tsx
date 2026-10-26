import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { MotionProvider } from './motion-provider';
import { SiteFooter, SiteHeader } from './site-header';

let pathname = '/collection';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function mockMatchMedia() {
  const query = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query));
}

function renderHeader(locale: 'en' | 'ja' = 'en') {
  return render(
    <MotionProvider>
      <SiteHeader locale={locale} t={en} />
    </MotionProvider>,
  );
}

beforeEach(() => {
  pathname = '/collection';
  mockMatchMedia();
  window.history.replaceState(null, '', '/collection');
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('site header', () => {
  it('lists the one navigation vocabulary in order, with no outward arrow on Auctions', () => {
    renderHeader();
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([en.collection, en.auctions, en.process]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/collection',
      '/auctions',
      '/process',
    ]);
    expect(nav.querySelector('svg')).toBeNull();
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[1]).not.toHaveAttribute('aria-current');
  });

  it('marks nested routes as current without matching unrelated prefixes', () => {
    pathname = '/auctions/31';
    renderHeader();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: en.auctions })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: en.collection })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('gives the mark a constant accessible name', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: en.markLabel })).toBeInTheDocument();
  });

  it('keeps a constant toggle label and reports the paused state through aria-pressed', () => {
    renderHeader();
    const toggle = screen.getByRole('button', { name: en.pauseAmbientMotion });
    expect(toggle).toHaveClass('motion-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: en.pauseAmbientMotion })).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the language list from the trigger and carries the current search params', () => {
    window.history.replaceState(null, '', '/collection?view=atlas&q=31');
    renderHeader();
    const trigger = screen.getByRole('button', { name: `${en.language}: EN` });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: en.language })).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('navigation', { name: en.language });
    const japanese = within(list).getByRole('link', { name: '日本語' });
    expect(japanese).toHaveAttribute('href', '/ja/collection?view=atlas&q=31');
    expect(japanese).toHaveAttribute('hreflang', 'ja');
    expect(within(list).getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      '/collection?view=atlas&q=31',
    );
    expect(within(list).getByRole('link', { name: 'English' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(list).getAllByRole('link')).toHaveLength(8);
  });

  it('closes the language list on Escape, returning focus, and on an outside press', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: `${en.language}: EN` });
    fireEvent.click(trigger);
    expect(screen.getByRole('navigation', { name: en.language })).toBeVisible();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('navigation', { name: en.language })).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('navigation', { name: en.language })).toBeVisible();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole('navigation', { name: en.language })).toBeNull();
  });

  it('keeps a press inside the list open', () => {
    renderHeader('ja');
    fireEvent.click(screen.getByRole('button', { name: `${en.language}: JA` }));
    const list = screen.getByRole('navigation', { name: en.language });
    act(() => {
      fireEvent.pointerDown(within(list).getByRole('link', { name: 'English' }));
    });
    expect(screen.getByRole('navigation', { name: en.language })).toBeVisible();
  });
});

describe('site footer', () => {
  it('repeats the navigation vocabulary, the policies and the one outward link', () => {
    render(<SiteFooter locale="en" t={en} />);
    const nav = screen.getByRole('navigation', { name: 'Cosmic Signature' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      en.collection,
      en.auctions,
      en.process,
      en.terms,
      en.privacy,
      `${en.openProtocol} ↗`,
    ]);
    expect(links.at(-1)).toHaveAttribute('href', 'https://cosmicsignature.com');
    expect(screen.getByRole('img', { name: en.markLabel })).toBeInTheDocument();
  });
});
