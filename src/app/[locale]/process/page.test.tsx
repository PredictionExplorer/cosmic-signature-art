import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { essayFigures } from '@/lib/art/essay-figures';
import { workFolio } from '@/lib/art/number';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { essayFacts, paragraph } from '@/lib/essay/facts';
import { SOURCE_ORDER } from '@/lib/essay/numerals';
import { plain } from '@/lib/essay/rich';
import { SOURCES } from '@/lib/essay/sources';
import { ESSAY, TERMS } from '@/lib/essay/structure';
import { catalogs } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/lib/i18n/routing';
import Process, { generateMetadata } from './page';

/**
 * The Process page whole, as the server sends it: every chapter of the essay, its figures, its
 * terms and its sources, in each language. The live record is not asked: the page paints from
 * the registry first, and that is what is read here.
 */
vi.mock('@/lib/art/server', () => ({
  getArtwork: async () => ({ status: 'unavailable' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/process',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

/** The page's HTML with every boundary settled and in its place, read as a document. */
async function page(locale: Locale) {
  const element = await Process({ params: Promise.resolve({ locale }) });
  const errors: unknown[] = [];
  const { prelude } = await prerender(element, {
    progressiveChunkSize: Infinity,
    onError: (error) => void errors.push(error),
  });
  const sent = document.createElement('div');
  sent.innerHTML = await new Response(prelude).text();
  expect(errors).toEqual([]);
  return sent;
}
const spaced = (text: string | null | undefined) => (text ?? '').replace(/\u00a0/g, ' ');

beforeEach(() => {
  // One day's work for every assertion, whatever day the suite runs on.
  vi.stubEnv('COSMIC_VENUE_DATE', '2026-11-06');
});

describe('the Process page', () => {
  it('sets the essay in order: the cover, Light, six chapters on night, Ink, the rest on paper', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const day = workOfTheDay();
    expect(html.querySelector('h1')).toHaveTextContent(t.processTitle);
    expect(html.querySelector('h1 + p')).toHaveTextContent(t.essayStandfirst);

    const sections = [...html.querySelectorAll('main > section')];
    expect(
      sections.map((section) => `${section.id}:${section.getAttribute('data-ground')}`),
    ).toEqual([
      ':night',
      'light:night',
      ...ESSAY.filter(({ ground }) => ground === 'night').map(({ id }) => `${id}:night`),
      'spectrum:night',
      'ink:paper',
      ...ESSAY.filter(({ ground }) => ground === 'paper').map(({ id }) => `${id}:paper`),
      'terms:paper',
      'sources:paper',
      ':paper',
    ]);
    // One hard seam: night never returns once the paper begins.
    const grounds = sections.map((section) => section.getAttribute('data-ground'));
    expect(grounds.lastIndexOf('night')).toBeLessThan(grounds.indexOf('paper'));

    // The contents lead to every chapter, by number and word, then to the two closing lists.
    const contents = [...html.querySelectorAll('nav[aria-label="Process"] a')];
    expect(contents.map((link) => `${link.getAttribute('href')} ${link.textContent}`)).toEqual([
      ...ESSAY.map(({ id, numeral, word }) => `#${id} ${numeral}${t[word]}`),
      `#terms ·${t.essayTermsWord}`,
      `#sources ·${t.essaySourcesWord}`,
    ]);
    for (const link of contents)
      expect(html.querySelector(link.getAttribute('href')!), link.textContent!).not.toBeNull();

    // Each chapter is a region named by its statement, with its number beside it.
    for (const { id, numeral, title } of ESSAY) {
      const section = html.querySelector(`#${id}`)!;
      expect(section.getAttribute('aria-labelledby')).toBe(`${id}-title`);
      expect(section.querySelector(`h2#${id}-title`)).toHaveTextContent(t[title]);
      expect(section.querySelector('.numeral')).toHaveTextContent(numeral);
    }
    // The two plates say whose they are, and the coda still leads into the day's work.
    expect(spaced(html.querySelector('#light header')!.textContent)).toContain(
      `This is № ${workFolio(day)} in Light`,
    );
    expect(html.querySelector('#ink header')).toHaveTextContent(t.essayInkCopy);
    expect(html.querySelector('main > section:last-child a')).toHaveAttribute(
      'href',
      `/art/${day}`,
    );
  });

  it('says of the day’s work what its record says, with every blank filled', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const facts = essayFacts(workOfTheDay(), 'en', t)!;
    expect(html.querySelector('main')!.textContent).not.toMatch(/\{\w+\}|\[\^|\*\*|\^\{/);
    // Every paragraph of every chapter is on the page, word for word, once its sources' numerals
    // are set aside.
    const unmarked = html.querySelector('main')!.cloneNode(true) as HTMLElement;
    for (const mark of unmarked.querySelectorAll('sup:has(> a[href^="#source-"])')) mark.remove();
    const words = spaced(unmarked.textContent);
    for (const { blocks } of ESSAY)
      for (const block of blocks)
        if (block.kind === 'p' || block.kind === 'record' || block.kind === 'note')
          expect(words).toContain(spaced(plain(paragraph(block.parts, facts, t))));
    // What the record says is set apart under the work's number.
    const records = [...html.querySelectorAll('[role="note"] > p.small-caps')];
    expect(records.map((label) => spaced(label.textContent))).toEqual(
      Array(2).fill(`From the record of № ${workFolio(facts.id)}`),
    );
    // The choice keeps its live figure, under the record's own line.
    const choice = html.querySelector('#choice')!;
    expect(spaced(choice.textContent)).toContain(
      `One of 100,000 candidate orbits. Number ${facts.orbit.generation.selectedIndex.toLocaleString('en')} was chosen.`,
    );
    expect(choice.querySelector('figure[data-phase]')).not.toBeNull();
  });

  it('draws the eight figures, labels the four derived from a work, and puts no word inside one', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const figures = [...html.querySelectorAll('figure[data-figure]')];
    expect(figures.map((figure) => figure.getAttribute('data-figure'))).toEqual([
      'pair',
      'arrangements',
      'ledger',
      'pushes',
      'energy',
      'twin',
      'plaits',
      'sheet',
    ]);
    for (const figure of figures) {
      const name = figure.getAttribute('data-figure');
      const label = figure.querySelector('figcaption > .small-caps');
      if (['pair', 'energy', 'twin', 'sheet'].includes(name!))
        expect(label, name!).toHaveTextContent(t.analysisNotWork);
      else expect(label, name!).toBeNull();
      expect(
        figure.querySelector('figcaption > span:last-child')!.textContent!.length,
      ).toBeGreaterThan(60);
      // The drawing is the caption's to describe; what marks it carries are figures only.
      const drawing = figure.firstElementChild!;
      expect(drawing.getAttribute('aria-hidden'), name!).toBe('true');
      expect(drawing.querySelectorAll('svg').length).toBeGreaterThan(0);
      expect(spaced(drawing.textContent), name!).toMatch(/^[\d\s:,.№−]*$/);
    }
    // The energy's two lines are named by their works; the scale's marks are a thousand apart.
    const energy = html.querySelector('figure[data-figure="energy"]')!;
    expect(spaced(energy.firstElementChild!.textContent)).toContain(
      `№ ${workFolio(essayFigures.energy.lostExample.id)}`,
    );
    expect(energy.querySelectorAll('sup')).toHaveLength(5);
  });

  it('gives each term its meaning and each numeral its source', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const terms = [...html.querySelectorAll('#terms dl > div')];
    expect(terms.map((term) => term.querySelector('dt')!.textContent)).toEqual(
      TERMS.map(([term]) => t[term]),
    );
    for (const term of terms)
      expect(term.querySelector('dd')!.textContent!.length).toBeGreaterThan(30);

    const entries = [...html.querySelectorAll('#sources ol > li')];
    expect(entries.map((entry) => entry.id)).toEqual(
      SOURCE_ORDER.map((_key, index) => `source-${index + 1}`),
    );
    entries.forEach((entry, index) => {
      const references = SOURCES[SOURCE_ORDER[index]];
      expect(
        [...entry.querySelectorAll('ul > li')].map((item) => spaced(item.textContent)),
      ).toEqual(references.map(({ text, ...rest }) => ('href' in rest ? `${text} ↗` : text)));
    });
    // A link out opens apart, and says so with the venue's one sign for leaving.
    for (const link of html.querySelectorAll('#sources a')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
      expect(link.textContent).toMatch(/\u00a0↗$/);
    }
    // Every numeral in the text leads to an entry that is there, under a name read aloud.
    const marks = [...html.querySelectorAll('main sup > a[href^="#source-"]')];
    expect(marks.length).toBeGreaterThan(40);
    for (const mark of marks) {
      const n = mark.textContent!;
      expect(mark).toHaveAttribute('href', `#source-${n}`);
      expect(mark).toHaveAttribute('aria-label', `Note ${n}`);
      expect(html.querySelector(`#source-${n}`)).not.toBeNull();
    }
    expect(new Set(marks.map((mark) => mark.textContent)).size).toBe(SOURCE_ORDER.length);
  });

  it('is whole in every language: the same parts, and no blank or mark left to read', async () => {
    for (const locale of locales.filter((code) => code !== 'en')) {
      const t = catalogs[locale];
      const html = await page(locale);
      const words = html.querySelector('main')!.textContent!;
      expect(words, locale).not.toMatch(/\{\w+\}|\[\^|\*\*|\^\{/);
      expect(html.querySelectorAll('main > section'), locale).toHaveLength(ESSAY.length + 7);
      expect(html.querySelectorAll('figure[data-figure]'), locale).toHaveLength(8);
      expect(html.querySelector('#sources ol')!.children, locale).toHaveLength(SOURCE_ORDER.length);
      expect(html.querySelector('h1'), locale).toHaveTextContent(t.processTitle);
      for (const { id, title } of ESSAY)
        expect(html.querySelector(`#${id}-title`), `${id} in ${locale}`).toHaveTextContent(
          t[title],
        );
    }
  }, 60_000);

  it('describes itself to a search by the essay’s title, in the reader’s language', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    expect(metadata.alternates?.canonical).toBe('https://cosmic.art/ja/process');
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({});
    await expect(Process({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
