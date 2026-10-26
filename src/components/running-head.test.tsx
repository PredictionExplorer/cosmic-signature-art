import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { MotionProvider } from './motion-provider';
import { RunningHead } from './running-head';
import { closeSheet, useOpenSheet } from './sheets-store';

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

function SheetProbe() {
  const sheet = useOpenSheet();
  return <output data-testid="sheet">{sheet ?? 'none'}</output>;
}

function renderHead(locale: 'en' | 'ja' = 'en') {
  return render(
    <MotionProvider>
      <RunningHead locale={locale} t={en} />
      <SheetProbe />
    </MotionProvider>,
  );
}

beforeEach(() => {
  pathname = '/collection';
  mockMatchMedia();
  window.history.replaceState(null, '', '/collection');
  sessionStorage.clear();
  act(() => closeSheet());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('running head', () => {
  it('lists the one navigation vocabulary in order, Statement included, with no outward arrow', () => {
    renderHead();
    const nav = screen.getByRole('navigation', { name: en.siteNavigation });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      en.collection,
      en.auctions,
      en.process,
      en.statement,
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/collection',
      '/auctions',
      '/process',
      '/statement',
    ]);
    expect(nav.querySelector('svg')).toBeNull();
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[1]).not.toHaveAttribute('aria-current');
  });

  it('marks nested routes as current without matching unrelated prefixes', () => {
    pathname = '/auctions/31';
    renderHead();
    const nav = screen.getByRole('navigation', { name: en.siteNavigation });
    expect(within(nav).getByRole('link', { name: en.auctions })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: en.collection })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('types the wordmark and gives the mark a constant accessible name', () => {
    renderHead();
    const brand = screen.getByRole('link', { name: 'Cosmic Signature' });
    expect(brand.querySelector('.brand-name')).toHaveTextContent('Cosmic Signature');
    expect(within(brand).getByRole('img', { name: en.markLabel })).toBeInTheDocument();
  });

  it('opens the Index sheet from the Index word and reports it as expanded', () => {
    renderHead();
    const index = screen.getByRole('button', { name: en.index });
    expect(index).toHaveAttribute('aria-expanded', 'false');
    expect(index).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(index);
    expect(screen.getByTestId('sheet')).toHaveTextContent('index');
    expect(index).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the inert overlay copy out of the accessibility tree', () => {
    renderHead();
    const overlay = document.querySelector('.head-overlay')!;
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay).toHaveAttribute('inert');
    expect(screen.getAllByRole('button', { name: en.index })).toHaveLength(1);
    // The skip link, the wordmark and the four words; the overlay adds no anchor at all.
    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(overlay.querySelectorAll('a')).toHaveLength(0);
  });

  it('keeps a constant toggle label and reports the paused state through aria-pressed', () => {
    renderHead();
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
    window.history.replaceState(null, '', '/collection?order=spectrum&q=31');
    renderHead();
    const trigger = screen.getByRole('button', { name: `${en.language}: EN` });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: en.language })).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('navigation', { name: en.language });
    const japanese = within(list).getByRole('link', { name: '日本語' });
    expect(japanese).toHaveAttribute('href', '/ja/collection?order=spectrum&q=31');
    expect(japanese).toHaveAttribute('hreflang', 'ja');
    expect(within(list).getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      '/collection?order=spectrum&q=31',
    );
    expect(within(list).getByRole('link', { name: 'English' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(within(list).getAllByRole('link')).toHaveLength(8);
  });

  it('closes the language list on Escape, returning focus, and on an outside press', () => {
    renderHead();
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
    renderHead('ja');
    fireEvent.click(screen.getByRole('button', { name: `${en.language}: JA` }));
    const list = screen.getByRole('navigation', { name: en.language });
    act(() => {
      fireEvent.pointerDown(within(list).getByRole('link', { name: 'English' }));
    });
    expect(screen.getByRole('navigation', { name: en.language })).toBeVisible();
  });
});
