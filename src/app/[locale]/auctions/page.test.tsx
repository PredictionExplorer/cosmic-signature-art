import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cycles } from '@/lib/art/collection-index';
import { en } from '@/lib/i18n/en';
import { ja } from '@/lib/i18n/ja';
import { fill } from '@/lib/i18n/format';
import Auctions from './page';

const sale = vi.hoisted(() => ({ configured: false }));
vi.mock('@/lib/auction/config', () => ({
  get auctionConfigured() {
    return sale.configured;
  },
}));
// The launch is the sale's own (its lots, or the coming cycle's strip); proved in its own specs.
vi.mock('@/components/auction-launch', () => ({ AuctionLaunch: () => null }));
afterEach(() => {
  sale.configured = false;
});

const page = async (locale: string) =>
  render(await Auctions({ params: Promise.resolve({ locale }) }));

describe('the title spread', () => {
  it('opens as two facing pages: the title on one, the foreword, said once, on the other', async () => {
    await page('en');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: fill(en.saleTitle, { n: '01' }),
    });
    const spread = screen.getByRole('region', { name: heading.textContent! });
    const pages = [...spread.children];
    expect(pages).toHaveLength(2);
    const [verso, recto] = pages as [HTMLElement, HTMLElement];
    expect(verso).toContainElement(heading);
    expect(within(verso).getByText(en.auctionNotLive)).toBeVisible();
    // The foreword is one paragraph, printed once, with its signature and the way in.
    expect(screen.getAllByText(en.auctionIntro)).toHaveLength(1);
    expect(within(recto).getByText(en.auctionIntro).tagName).toBe('P');
    expect(within(recto).getByText(en.statementSigned)).toBeVisible();
    expect(within(recto).getByRole('link', { name: en.conditionsOfSale })).toHaveAttribute(
      'href',
      '#conditions',
    );
  });

  it('leads into the lots once a sale is offered', async () => {
    sale.configured = true;
    await page('en');
    const spread = screen.getByRole('region', { name: fill(en.saleTitle, { n: '01' }) });
    expect(within(spread).queryByText(en.auctionNotLive)).toBeNull();
    expect(within(spread).getByRole('link', { name: en.browseLots })).toHaveAttribute(
      'href',
      '#auction-catalogue',
    );
  });
});

describe('the sale before it is offered', () => {
  it('hangs the last imprinted cycle, labelled as not offered, each work leading to its own page', async () => {
    await page('en');
    const latest = cycles().at(-1)!;
    const coming = latest.cycle + 1;
    const section = screen.getByRole('region', {
      name: `${en.saleMeanwhileLabel} Cycle ${latest.cycle}`,
    });
    expect(within(section).getByText(en.saleMeanwhileLabel)).toBeVisible();
    expect(within(section).getByText(fill(en.saleMeanwhileNote, { cycle: coming }))).toBeVisible();
    // Every work of the cycle, in Ink and in Light; none of them a lot.
    const links = within(section).getAllByRole('link');
    const works = links.filter((link) =>
      /^\/art\/\d+\?expression=(ink|light)$/.test(link.getAttribute('href')!),
    );
    expect(works).toHaveLength(latest.count * 2);
    expect(links.some((link) => link.getAttribute('href')!.startsWith('/auctions'))).toBe(false);
    for (const work of works) expect(work).toHaveAccessibleDescription(en.saleMeanwhileLabel);
    // It hangs between the sale's status and its conditions, which still close the book.
    const conditions = screen.getByRole('heading', { level: 2, name: en.conditionsOfSale });
    expect(section.compareDocumentPosition(conditions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('speaks the visitor’s language', async () => {
    await page('ja');
    const latest = cycles().at(-1)!;
    expect(
      screen.getByRole('region', { name: `${ja.saleMeanwhileLabel} ${ja.cycle} ${latest.cycle}` }),
    ).toBeInTheDocument();
    expect(screen.getByText(fill(ja.saleMeanwhileNote, { cycle: latest.cycle + 1 }))).toBeVisible();
  });

  it('is gone once a sale is offered: then the lots hang there, and nothing else does', async () => {
    sale.configured = true;
    await page('en');
    expect(screen.queryByText(en.saleMeanwhileLabel)).toBeNull();
    expect(
      screen.queryAllByRole('link').some((link) => link.getAttribute('href')?.startsWith('/art/')),
    ).toBe(false);
  });
});
