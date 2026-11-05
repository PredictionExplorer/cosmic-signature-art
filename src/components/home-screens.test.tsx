import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { collectionIndex, cycles, indexedWork } from '@/lib/art/collection-index';
import plateRecords from '@/lib/art/plate-records.json';
import { MotionProvider } from './motion-provider';
import { HomeCycle, HomeSpread, HomeStatement } from './home-screens';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function mockMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    }),
  );
}
beforeEach(mockMatchMedia);
afterEach(() => vi.unstubAllGlobals());

const tone = (id: number) =>
  (plateRecords as { records: { id: number; ink?: { tone: string } }[] }).records.find(
    (record) => record.id === id,
  )!.ink!.tone;

describe('home screen 3: the statement', () => {
  it('types the venue, its subtitle and the counts read from the index', () => {
    render(<HomeStatement locale="en" t={en} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cosmic Signature');
    expect(screen.getByText(en.shapeOfMotion)).toBeInTheDocument();
    const summary = cycles();
    const counts = screen.getByText(new RegExp(en.livingCollection));
    expect(counts).toHaveTextContent(`Cycle ${summary[0].cycle} to Cycle ${summary.at(-1)!.cycle}`);
    expect(counts).toHaveTextContent(`${collectionIndex.total} works`);
    expect(counts).toHaveTextContent('since June 2026');
    expect(screen.getByText(en.statementLine)).toBeInTheDocument();
    expect(screen.getByText(en.statementSigned)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: `${en.collection} →` });
    expect(link).toHaveAttribute('href', '/collection');
  });
});

describe('home screen 4: the spread', () => {
  it('hangs one work in Ink on paper beside the other in Light on night, with the numerals and the Walk', () => {
    render(
      <MotionProvider>
        <HomeSpread locale="ja" t={en} day="ink" />
      </MotionProvider>,
    );
    const spread = screen.getByRole('region', { name: en.selectedWorks });
    const links = within(spread).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/ja/art/31?expression=ink',
      '/ja/art/35?expression=light',
    ]);
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      '№ 031 · Ink',
      '№ 035 · Light',
    ]);
    expect(links[0].closest('[data-ground]')).toHaveAttribute('data-ground', 'paper');
    expect(links[1].closest('[data-ground]')).toHaveAttribute('data-ground', 'night');
    // Both leaves can wake: Ink into its excerpt, Light into its settling clip.
    expect(links.every((link) => link.getAttribute('data-preview-available') === 'true')).toBe(
      true,
    );
    const images = within(spread).getAllByRole('img', { name: /№ 03[15] · (Ink|Light)/ });
    expect(
      images.map((image) => new URL(image.getAttribute('src')!, 'http://localhost').pathname),
    ).toEqual(['/art/31-ink-640.webp', '/art/35-light-640.webp']);
    const figures = spread.querySelectorAll('figure');
    expect(figures).toHaveLength(2);
    expect(figures[0].getAttribute('style')).toContain(`--plate-ground: ${tone(31)}`);
    expect(figures[1].getAttribute('style')).toContain('--plate-ground: #000000');
    expect(figures[0].querySelector('.hanging-numeral')).toHaveTextContent('031');
    expect(figures[1].querySelector('.hanging-numeral')).toHaveTextContent('035');
    expect(within(spread).getByText('№ 031')).toBeInTheDocument();
    // No clip plays until a hand or focus asks for it; the label says only the expression.
    expect(spread.querySelectorAll('video')).toHaveLength(0);
    expect(within(spread).getByText('Ink')).toBeInTheDocument();
    expect(within(spread).getByText('Light')).toBeInTheDocument();
  });

  it('changes the two works’ places with the day, so each hangs in both', () => {
    render(
      <MotionProvider>
        <HomeSpread locale="en" t={en} day="light" />
      </MotionProvider>,
    );
    const spread = screen.getByRole('region', { name: en.selectedWorks });
    expect(
      within(spread)
        .getAllByRole('link')
        .map((link) => link.getAttribute('aria-label')),
    ).toEqual(['№ 035 · Ink', '№ 031 · Light']);
  });
});

describe('home screen 5: this cycle', () => {
  it('names the day’s work’s cycle, its count and date, and links every work of the cycle', () => {
    render(<HomeCycle locale="en" t={en} dayWork={23} />);
    const cycle = indexedWork(23)!.cycle!;
    const summary = cycles().find((candidate) => candidate.cycle === cycle)!;
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`Cycle ${cycle}`);
    expect(screen.getByText(new RegExp(`${summary.count} works · imprinted`))).toHaveTextContent(
      'June 15, 2026',
    );
    // The cycle hangs twice across the seam: in Ink on paper, and in Light on night.
    const ink = screen.getByRole('list', { name: en.ink });
    const light = screen.getByRole('list', { name: en.light });
    expect(ink).toHaveAttribute('data-ground', 'paper');
    expect(light).toHaveAttribute('data-ground', 'night');
    const links = within(ink).getAllByRole('link');
    expect(links).toHaveLength(summary.count);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      summary.ids.map((id) => `/art/${id}?expression=ink`),
    );
    expect(
      within(light)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(summary.ids.map((id) => `/art/${id}?expression=light`));
    const first = within(links[0]).getByRole('img');
    expect(first).toHaveAttribute('alt', `№ ${String(summary.ids[0]).padStart(3, '0')} · Ink`);
    expect(first).toHaveAttribute('loading', 'lazy');
    expect(first.getAttribute('src')).toMatch(
      /^https:\/\/a1\.cosmicsignature\.com\/images\/new\/cosmicsignature\/0x[a-f0-9]{64}\/images\/web\/ember_preview\.webp$/,
    );
    expect(
      within(within(light).getAllByRole('link')[0]).getByRole('img').getAttribute('src'),
    ).toMatch(/\/images\/web\/preview\.webp$/);
    expect(within(links[0]).getByText(String(summary.ids[0]).padStart(3, '0'))).toBeVisible();
    expect(screen.getByRole('link', { name: `${en.theCollection} →` })).toHaveAttribute(
      'href',
      `/collection?order=cycle&cycle=${cycle}`,
    );
  });

  it('renders nothing for a work the index does not know', () => {
    const { container } = render(<HomeCycle locale="en" t={en} dayWork={999} />);
    expect(container).toBeEmptyDOMElement();
  });
});
