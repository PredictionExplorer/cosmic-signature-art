import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { collectionIndex, cycles, indexedWork } from '@/lib/art/collection-index';
import { collectionCounts, CycleRow } from './home-screens';

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

describe('the collection in the index’s own counts', () => {
  it('says the cycles it spans, the works it has, and since when', () => {
    const summary = cycles();
    expect(collectionCounts('en', en)).toEqual([
      `Cycle ${summary[0].cycle} to Cycle ${summary.at(-1)!.cycle}`,
      `${collectionIndex.total} works`,
      'since June 2026',
    ]);
    // A date is worded as the reader's language words one.
    expect(collectionCounts('uk', en).at(-1)).toMatch(/червень 2026/);
  });
});

describe('a cycle hung twice across the seam', () => {
  it('names the cycle, its count and date, and links every work of the cycle', () => {
    const cycle = indexedWork(23)!.cycle!;
    render(<CycleRow locale="en" t={en} cycle={cycle} id="home-cycle" ground="paper" />);
    const summary = cycles().find((candidate) => candidate.cycle === cycle)!;
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`Cycle ${cycle}`);
    expect(screen.getByText(new RegExp(`${summary.count} works · imprinted`))).toHaveTextContent(
      'June 15, 2026',
    );
    // The section says which ground it stands on, where a page's head follows its sections.
    expect(screen.getByRole('region', { name: `Cycle ${cycle}` })).toHaveAttribute(
      'data-ground',
      'paper',
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
    expect(first).toHaveAttribute('alt', `№\u00a0${String(summary.ids[0]).padStart(3, '0')} · Ink`);
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
});

describe('a cycle row under a label', () => {
  it('names the section by its label and cycle, says what the label means, and describes every work by it', () => {
    const latest = cycles().at(-1)!;
    render(
      <CycleRow
        locale="en"
        t={en}
        cycle={latest.cycle}
        id="sale-meanwhile"
        label={en.saleMeanwhileLabel}
        note="A note."
      />,
    );
    const section = screen.getByRole('region', {
      name: `${en.saleMeanwhileLabel} Cycle ${latest.cycle}`,
    });
    const label = within(section).getByText(en.saleMeanwhileLabel);
    // The label stands first, above the heading, and the note beneath the count.
    expect(label.compareDocumentPosition(within(section).getByRole('heading', { level: 2 }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(section).getByText('A note.')).toBeVisible();
    // Every work is described by the label, in both leaves, and leads to its own page.
    const links = within(section)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/art/'));
    expect(links).toHaveLength(latest.count * 2);
    for (const link of links) {
      expect(link).toHaveAttribute('aria-describedby', label.id);
      expect(link).toHaveAccessibleDescription(en.saleMeanwhileLabel);
    }
  });

  it('carries no label, no ground, and describes nothing, where none is given', () => {
    render(<CycleRow locale="en" t={en} cycle={indexedWork(23)!.cycle!} id="home-cycle" />);
    const section = screen.getByRole('region', { name: /^Cycle \d+$/ });
    expect(section).not.toHaveAttribute('data-ground');
    for (const link of screen.getAllByRole('link'))
      expect(link).not.toHaveAttribute('aria-describedby');
  });

  it('renders nothing for a cycle the index does not know', () => {
    const { container } = render(<CycleRow locale="en" t={en} cycle={99} id="nowhere" />);
    expect(container).toBeEmptyDOMElement();
  });
});
