import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compactWorks } from '@/lib/art/collection-index';
import { fill } from '@/lib/i18n/format';
import { en } from '@/lib/i18n/en';
import {
  collectionHref,
  cyclesOf,
  facetsOf,
  IndexSheet,
  readHanging,
  seenExpression,
} from './index-sheet';
import { closeSheet, openSheet, useOpenSheet } from './sheets-store';
import { EXPRESSION_KEY } from '@/lib/storage-keys';

let pathname = '/collection';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
const motion = vi.hoisted(() => ({ toggle: vi.fn(), paused: false }));
vi.mock('./motion-provider', () => ({
  useMotion: () => ({ paused: motion.paused, toggle: motion.toggle, theatre: 'playing' }),
}));
vi.mock('./media-policy', () => ({ useMediaPolicy: () => ({ visible: true, constrained: true }) }));

const works = compactWorks();
// The pointer the sheet sees: fine by default, coarse (a finger) where a test asks.
const pointer = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };

function Probe() {
  const sheet = useOpenSheet();
  return <output data-testid="sheet">{sheet ?? 'none'}</output>;
}
/** Days the venue's arithmetic answers for a pool of three: an Ink day and a Light day. */
const DAYS = { ink: '2026-11-06', light: '2026-11-05' } as const;
/** An Ink day unless a case says otherwise. */
function renderSheet(locale: 'en' | 'ja' = 'en', day: 'ink' | 'light' = 'ink') {
  return render(
    <>
      <IndexSheet works={works} locale={locale} t={en} poolSize={3} pinned={DAYS[day]} />
      <Probe />
    </>,
  );
}
const alone = (expression: string) => fill(en.hangAlone, { expression });
function numeral(id: number) {
  return screen.getByRole('link', { name: `№ ${String(id).padStart(3, '0')}` });
}
function wall() {
  return document.querySelector('[data-material] img') as HTMLImageElement | null;
}

beforeEach(() => {
  pathname = '/collection';
  pointer.matches = false;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(pointer));
  window.history.replaceState(null, '', '/collection');
  sessionStorage.clear();
  act(() => closeSheet());
  // jsdom has no dialog implementation; the sheet calls what the platform provides.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});
afterEach(() => {
  document.documentElement.style.overflow = '';
  vi.unstubAllGlobals();
});

describe('the index helpers', () => {
  it('groups the compact index into cycles with their earliest mint and ascending numerals', () => {
    const cycles = cyclesOf(works);
    expect(cycles.map((cycle) => [cycle.cycle, cycle.works.length])).toEqual([
      [0, 24],
      [1, 24],
      [2, 24],
    ]);
    expect(cycles[0].works.map((work) => work.id).slice(0, 3)).toEqual([0, 1, 2]);
    expect(cycles[2].mintedAt).toBe('2026-10-05T10:14:37.000Z');
    expect(cyclesOf([{ id: 9 }])).toEqual([]);
  });

  it('offers only the trait values the index actually holds, sorted', () => {
    const facets = facetsOf(works);
    expect(facets.fate).toEqual(['Ejection', 'Eternal Dance']);
    expect(facets.massBalance).toEqual(['Equal Trio', 'Heavy Primary', 'Twin Binary']);
    expect(facets.spectralClass).toEqual(['A', 'B', 'F', 'G', 'K', 'M', 'O']);
    expect(facetsOf([{ id: 1 }]).structure).toEqual([]);
  });

  it('builds collection links that keep the view and change one thing', () => {
    const current = new URLSearchParams('order=cycle&expression=light&fate=Ejection&offset=18&q=x');
    // Choosing an ordering leaves a search behind, as the page's own orderings do.
    expect(collectionHref('en', current, { order: 'spectrum' })).toBe(
      '/collection?order=spectrum&expression=light&fate=Ejection',
    );
    expect(collectionHref('ja', current, { order: 'number', expression: 'ink' })).toBe(
      '/ja/collection?expression=ink&fate=Ejection',
    );
    // Both across the seam is the collection's own hanging, so it names no expression.
    expect(collectionHref('ja', current, { order: 'number', expression: 'both' })).toBe(
      '/ja/collection?fate=Ejection',
    );
    expect(collectionHref('en', current, { order: 'number', q: 'moon' })).toBe(
      '/collection?expression=light&fate=Ejection&q=moon',
    );
    expect(collectionHref('en', current, { fate: null, structure: 'Time Chords' })).toBe(
      '/collection?order=cycle&expression=light&q=x&structure=Time+Chords',
    );
    expect(collectionHref('en', new URLSearchParams(), {})).toBe('/collection');
  });

  it('reads the hanging from the URL: one expression alone, or both across the seam', () => {
    expect(readHanging(new URLSearchParams('expression=light'))).toBe('light');
    expect(readHanging(new URLSearchParams('expression=ink'))).toBe('ink');
    expect(readHanging(new URLSearchParams())).toBe('both');
    expect(readHanging(new URLSearchParams('expression=silk'))).toBe('both');
  });

  it('shows a work in the hanging alone, else the session’s choice, else the day’s', () => {
    expect(seenExpression('ink', 'light', 'light')).toBe('ink');
    expect(seenExpression('both', 'light', 'ink')).toBe('light');
    expect(seenExpression('both', null, 'light')).toBe('light');
    expect(seenExpression('both', 'unknown', 'ink')).toBe('ink');
  });
});

describe('the Index of numbers', () => {
  it('stays empty until opened, then lists every numeral by cycle and closes from its word', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('id', 'index-sheet');
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.queryByRole('link', { name: '№ 031', hidden: true })).toBeNull();
    act(() => openSheet('index'));
    expect(dialog).toHaveAttribute('open');
    expect(document.documentElement.style.overflow).toBe('hidden');
    const index = screen.getByRole('list', { name: en.index });
    expect(
      within(index)
        .getAllByRole('listitem')
        .filter((item) => item.querySelector('ul')),
    ).toHaveLength(3);
    expect(within(index).getAllByRole('link')).toHaveLength(72);
    expect(numeral(31)).toHaveTextContent('031');
    expect(numeral(31)).toHaveAttribute('href', '/art/31');
    expect(screen.getByText(/imprinted August 11, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.closeIndex }));
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
    expect(dialog).not.toHaveAttribute('open');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('hangs the work under the hand or the focus on the wall, in the chosen expression', () => {
    renderSheet();
    act(() => openSheet('index'));
    expect(wall()).toBeNull();
    fireEvent.pointerEnter(numeral(31), { pointerType: 'mouse' });
    expect(wall()?.src).toMatch(/ember_preview\.webp$/);
    expect(wall()).toHaveAttribute('data-work', '31');
    expect(wall()!.closest('[data-material]')).toHaveAttribute('data-material', 'ink');
    fireEvent.focus(numeral(35));
    expect(wall()).toHaveAttribute('data-work', '35');
  });

  it('follows the Light expression from the URL into the wall and every link', () => {
    window.history.replaceState(null, '', '/collection?expression=light&order=cycle');
    renderSheet('ja');
    act(() => openSheet('index'));
    fireEvent.pointerEnter(numeral(31), { pointerType: 'mouse' });
    expect(wall()?.src).toMatch(/images\/web\/preview\.webp$/);
    expect(wall()!.closest('[data-material]')).toHaveAttribute('data-material', 'light');
    expect(numeral(31)).toHaveAttribute('href', '/ja/art/31?expression=light');
    const orderings = screen.getByRole('navigation', { name: en.ordering });
    expect(within(orderings).getByRole('link', { name: en.orderCycle })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(orderings).getByRole('link', { name: en.orderSpectrum })).toHaveAttribute(
      'href',
      '/ja/collection?order=spectrum&expression=light',
    );
    const ink = within(orderings).getByRole('link', { name: en.ink });
    expect(ink).toHaveAttribute('href', '/ja/collection?order=cycle&expression=ink');
    expect(ink).toHaveAttribute('title', alone(en.ink));
    expect(ink).not.toHaveAttribute('aria-current');
    // Light hangs alone: its word is marked, and hangs both again.
    const light = within(orderings).getByRole('link', { name: en.light });
    expect(light).toHaveAttribute('aria-current', 'true');
    expect(light).toHaveAttribute('title', en.hangTogether);
    expect(light).toHaveAttribute('href', '/ja/collection?order=cycle');
  });

  it('hangs the session’s expression on the wall when the URL names none, and leaves the work page to it', () => {
    sessionStorage.setItem(EXPRESSION_KEY, 'light');
    renderSheet();
    act(() => openSheet('index'));
    expect(numeral(0)).toHaveAttribute('href', '/art/0');
    fireEvent.pointerEnter(numeral(31), { pointerType: 'mouse' });
    expect(wall()!.closest('[data-material]')).toHaveAttribute('data-material', 'light');
  });

  it('hangs the day’s expression on the wall for a visitor who has not chosen one', () => {
    renderSheet('en', 'light');
    act(() => openSheet('index'));
    fireEvent.pointerEnter(numeral(31), { pointerType: 'mouse' });
    expect(wall()?.src).toMatch(/images\/web\/preview\.webp$/);
    expect(wall()!.closest('[data-material]')).toHaveAttribute('data-material', 'light');
  });

  it('under a finger, the first tap hangs the work and the second enters it', () => {
    pointer.matches = true;
    renderSheet();
    act(() => openSheet('index'));
    const link = numeral(31);
    // A coarse pointer has no hover: entering a numeral hangs nothing, nor does the focus a tap gives.
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    fireEvent.focus(link);
    expect(wall()).toBeNull();
    const first = fireEvent.click(link);
    expect(first).toBe(false);
    expect(wall()).toHaveAttribute('data-work', '31');
    expect(screen.getByTestId('sheet')).toHaveTextContent('index');
    const second = fireEvent.click(link);
    expect(second).toBe(true);
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
  });

  it('offers the filter chips from the index and a way to clear them', () => {
    window.history.replaceState(null, '', '/collection?fate=Ejection&cycle=2');
    renderSheet();
    act(() => openSheet('index'));
    const fate = screen.getByRole('list', { name: en.fate });
    const ejection = within(fate).getByRole('link', { name: 'Ejection' });
    expect(ejection).toHaveAttribute('aria-current', 'true');
    // An active chip links to the same view without itself.
    expect(ejection).toHaveAttribute('href', '/collection?cycle=2');
    expect(within(fate).getByRole('link', { name: 'Eternal Dance' })).toHaveAttribute(
      'href',
      '/collection?cycle=2&fate=Eternal+Dance',
    );
    const cycles = screen.getByRole('list', { name: en.cycle });
    expect(within(cycles).getByRole('link', { name: `${en.cycle} 2` })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('link', { name: en.clearFilters })).toHaveAttribute(
      'href',
      '/collection',
    );
    expect(screen.getByRole('group')).toHaveTextContent(en.palette);
  });

  it('searches the collection from a real 16 px field and closes on Escape', () => {
    renderSheet();
    act(() => openSheet('index'));
    const field = screen.getByRole('textbox', { name: en.search });
    expect(field.closest('form')).toHaveAttribute('action', '/collection');
    expect(field).toHaveAttribute('name', 'q');
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
  });

  it('keeps the full public directory, the pause control and every language in Index', () => {
    renderSheet();
    act(() => openSheet('index'));
    const menu = screen.getByRole('navigation', { name: en.siteNavigation });
    expect(
      within(menu)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([en.collection, en.exhibitions, en.process, en.statement]);
    expect(within(menu).getByRole('link', { name: en.collection })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(within(menu).getByRole('button', { name: en.pauseAmbientMotion }));
    expect(motion.toggle).toHaveBeenCalled();
    const languages = screen.getByRole('navigation', { name: en.language });
    expect(within(languages).getAllByRole('link')).toHaveLength(8);
    expect(within(languages).getByRole('link', { name: '日本語' })).toHaveAttribute(
      'href',
      '/ja/collection',
    );
  });

  it('offers the collection’s other two indexes, the current one marked', () => {
    pathname = '/ja/collection/orrery';
    renderSheet('ja');
    act(() => openSheet('index'));
    const views = screen.getByRole('navigation', { name: en.collectionViews });
    expect(within(views).getByRole('link', { name: en.allTheLight })).toHaveAttribute(
      'href',
      '/ja/collection/all-the-light',
    );
    const orrery = within(views).getByRole('link', { name: en.orrery });
    expect(orrery).toHaveAttribute('href', '/ja/collection/orrery');
    expect(orrery).toHaveAttribute('aria-current', 'page');
    expect(within(views).getByRole('link', { name: en.allTheLight })).not.toHaveAttribute(
      'aria-current',
    );
    // Away from the collection no ordering is the page, and no expression hangs alone there.
    const orderings = screen.getByRole('navigation', { name: en.ordering });
    expect(within(orderings).getByRole('link', { name: en.orderNumber })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(orderings).getByRole('link', { name: en.ink })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('reads nothing of the collection from a work page’s own query', () => {
    // A work opened in Light names its expression; the collection's links start afresh from it.
    pathname = '/art/35';
    window.history.replaceState(null, '', '/art/35?expression=light&view=still');
    renderSheet();
    act(() => openSheet('index'));
    const orderings = screen.getByRole('navigation', { name: en.ordering });
    expect(within(orderings).getByRole('link', { name: en.orderNumber })).toHaveAttribute(
      'href',
      '/collection',
    );
    for (const [word, expression] of [
      [en.ink, 'ink'],
      [en.light, 'light'],
    ] as const) {
      const choice = within(orderings).getByRole('link', { name: word });
      expect(choice).toHaveAttribute('href', `/collection?expression=${expression}`);
      expect(choice).not.toHaveAttribute('aria-current');
    }
    // The wall and the numerals follow the visit's choice or the day's, not the page's query.
    expect(numeral(31)).toHaveAttribute('href', '/art/31');
    fireEvent.pointerEnter(numeral(31), { pointerType: 'mouse' });
    expect(wall()!.closest('[data-material]')).toHaveAttribute('data-material', 'ink');
  });

  it('never offers the derived views where a work is for sale', () => {
    pathname = '/auctions/12';
    renderSheet();
    act(() => openSheet('index'));
    expect(screen.queryByRole('navigation', { name: en.collectionViews })).toBeNull();
    expect(screen.queryByRole('link', { name: en.allTheLight })).toBeNull();
    expect(screen.getByRole('navigation', { name: en.ordering })).toBeInTheDocument();
  });

  it('closes when the route changes', () => {
    const view = renderSheet();
    act(() => openSheet('index'));
    expect(screen.getByTestId('sheet')).toHaveTextContent('index');
    pathname = '/art/31';
    view.rerender(
      <>
        <IndexSheet works={works} locale="en" t={en} poolSize={3} pinned={DAYS.ink} />
        <Probe />
      </>,
    );
    expect(screen.getByTestId('sheet')).toHaveTextContent('none');
  });
});
