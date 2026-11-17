import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { essayFigures } from '@/lib/art/essay-figures';
import { workFolio } from '@/lib/art/number';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { essayFacts, paragraph } from '@/lib/essay/facts';
import { SOURCE_ORDER } from '@/lib/essay/numerals';
import { plain } from '@/lib/essay/rich';
import { SOURCES } from '@/lib/essay/sources';
import { ESSAY, TERMS, type EssayPart } from '@/lib/essay/structure';
import { catalogs, messages } from '@/lib/i18n/messages';
import { locales, type Locale } from '@/lib/i18n/routing';
import { HOME_NIGHT_PARTS, HOME_PAPER_PARTS } from '@/lib/room';
import { DAY_WORK_POOL } from '@/lib/art/work-of-the-day';
import Home, { generateMetadata } from './page';

/**
 * The home whole, as the server sends it: the day's plate, then the essay it is taken apart in:
 * every chapter, its figures, its terms and its sources, in each language. The live record is
 * not asked: the page paints from the registry first, and that is what is read here.
 */
vi.mock('@/lib/art/server', () => ({
  getArtwork: async () => ({ status: 'unavailable' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

/** The page's HTML with every boundary settled and in its place, read as a document. */
async function page(locale: Locale) {
  const element = await Home({ params: Promise.resolve({ locale }) });
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

const chaptersOf = (part: EssayPart) => ESSAY.filter((chapter) => chapter.part === part);

describe('the home', () => {
  it('opens on the day’s plate, then sets the essay in its three parts: the orbit, its Light, its Ink', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const day = workOfTheDay();
    // The work is the first thing on the page; the page's one headline is the cover's, beneath it.
    const first = html.querySelector('main > section')!;
    expect(first).toHaveAttribute('data-presentation', 'home');
    expect(first.querySelector('img:not([alt=""])')).toHaveAttribute(
      'alt',
      `№\u00a0${workFolio(day)} · Ink`,
    );
    expect(html.querySelectorAll('h1')).toHaveLength(1);
    expect(html.querySelector('h1')).toHaveTextContent(t.processTitle);
    expect(spaced(html.querySelector('h1 + p')!.textContent)).toBe(
      spaced(paragraph(['essayStandfirst'], essayFacts(day, 'en', t)!, t)),
    );
    // The cover says what the place is, in the index's own counts.
    expect(html.querySelector('.eyebrow')).toHaveTextContent(t.livingCollection);
    expect(spaced(html.querySelector('.counts')!.textContent)).toMatch(
      /^Cycle 0 to Cycle \d+ · \d+ works · since June 2026$/,
    );

    const sections = [...html.querySelectorAll('main > section')].slice(1);
    const ids = (part: EssayPart) => chaptersOf(part).map(({ id, ground }) => `${id}:${ground}`);
    expect(
      sections.map((section) => `${section.id}:${section.getAttribute('data-ground')}`),
    ).toEqual([
      ':night',
      'orbit:night',
      ...ids('orbit'),
      'light:night',
      ...ids('light'),
      'spectrum:night',
      'ink:paper',
      ...ids('ink'),
      ...ids('close'),
      // The close and the day's cycle, and then the back matter: the terms and the sources.
      'cycle:paper',
      ':paper',
      'terms:paper',
      'sources:paper',
    ]);
    // One hard seam beneath the plate: night never returns once the paper begins.
    const grounds = sections.map((section) => section.getAttribute('data-ground'));
    expect(grounds.lastIndexOf('night')).toBeLessThan(grounds.indexOf('paper'));
    // The first paint knows which parts stand on paper by their address (src/lib/room.ts).
    expect(
      sections
        .filter((section) => section.id && section.getAttribute('data-ground') === 'paper')
        .map((section) => section.id),
    ).toEqual([...HOME_PAPER_PARTS]);
    expect(
      sections
        .filter((section) => section.id && section.getAttribute('data-ground') === 'night')
        .map((section) => section.id),
    ).toEqual([...HOME_NIGHT_PARTS]);
    // And the addresses inside a part that the first paint knows by name are on the page.
    expect(html.querySelector('[data-ground="night"] #process-title')).not.toBeNull();
    expect(
      html.querySelector('[data-ground="paper"]#home-cycle, [data-ground="paper"] #home-cycle'),
    ).not.toBeNull();

    // The contents lead to every part in the page's own order: each part's plate under its
    // number, then its chapters by number and word; then the close and the two lists.
    const contents = [...html.querySelectorAll('nav[aria-label="Process"] a')];
    const entry = (part: EssayPart) =>
      chaptersOf(part).map(({ id, numeral, word }) => `#${id} ${numeral}${t[word]}`);
    expect(contents.map((link) => `${link.getAttribute('href')} ${link.textContent}`)).toEqual([
      `#orbit I${t.essayOrbitWord}`,
      ...entry('orbit'),
      `#light II${t.light}`,
      ...entry('light'),
      `#spectrum ·${t.chapterSpectrum}`,
      `#ink III${t.ink}`,
      ...entry('ink'),
      ...entry('close'),
      `#cycle ·${t.essayBornWord}`,
      `#terms ·${t.essayTermsWord}`,
      `#sources ·${t.essaySourcesWord}`,
    ]);
    for (const link of contents)
      expect(html.querySelector(link.getAttribute('href')!), link.textContent!).not.toBeNull();
    expect(new Set(contents.map((link) => link.getAttribute('href'))).size).toBe(contents.length);

    // Each chapter is a region named by its statement, with its number beside it.
    for (const { id, numeral, title } of ESSAY) {
      const section = html.querySelector(`#${id}`)!;
      expect(section.getAttribute('aria-labelledby')).toBe(`${id}-title`);
      expect(section.querySelector(`h2#${id}-title`)).toHaveTextContent(t[title]);
      expect(section.querySelector('.numeral')).toHaveTextContent(numeral);
    }
    // The three parts are numbered, each head a statement at a chapter's size, and read as one
    // sequence down the page.
    expect(
      ['orbit', 'light', 'ink'].map((id) => {
        const head = html.querySelector(`#${id} header`)!;
        return `${head.querySelector('.numeral')!.textContent} ${head.querySelector('h2.chapter')!.textContent}`;
      }),
    ).toEqual([`I ${t.gravityTitle}`, `II ${t.essayLightTitle}`, `III ${t.fluidTitle}`]);
    // A dash in a title stays with the word before it: no line of a title begins with one.
    const ukrainian = await page('uk');
    expect(ukrainian.querySelector('#orbit h2')!.textContent).toBe(
      catalogs.uk.gravityTitle.replace(' —', '\u00a0—'),
    );
    expect(catalogs.uk.gravityTitle).toContain(' — ');
    // The three plates say whose they are, and the close leads into the day's work and its cycle.
    expect(spaced(html.querySelector('#orbit header')!.textContent)).toContain(
      `This is № ${workFolio(day)}`,
    );
    expect(spaced(html.querySelector('#light header')!.textContent)).toContain(
      `This is № ${workFolio(day)} in Light`,
    );
    expect(html.querySelector('#ink header')).toHaveTextContent(t.essayInkCopy);
    expect(html.querySelector('#cycle a')).toHaveAttribute('href', `/art/${day}`);
    const cycle = html.querySelector('#cycle + section')!;
    expect(cycle.querySelector('h2')).toHaveTextContent(/^Cycle \d+$/);
    expect(cycle.querySelector('a[href^="/collection?order=cycle"]')).not.toBeNull();
    // The page ends on its sources.
    expect(html.querySelector('main > section:last-child')).toHaveAttribute('id', 'sources');
  });

  it('sets the orbit in depth on its still, with what it is and how it is turned', async () => {
    const t = catalogs.en;
    const html = await page('en');
    const day = workOfTheDay();
    const exhibit = html.querySelector('#orbit figure')!;
    // Before any script the still stands, and the page says beneath it that it is an analysis,
    // of what, and where the whole performance may be watched.
    expect(exhibit).toHaveAttribute('data-phase', 'resting');
    expect(exhibit.querySelector('img')).toHaveAttribute('alt', `№\u00a0${workFolio(day)} · Light`);
    expect(exhibit.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
    const about = html.querySelector(`#${exhibit.getAttribute('aria-describedby')}`)!;
    expect(about.closest('section')).toHaveAttribute('id', 'orbit');
    expect(about.querySelector('.small-caps')).toHaveTextContent(t.analysisNotWork);
    expect(about).toHaveTextContent(t.essayOrbitPlaces);
    expect(about).toHaveTextContent(t.depthNote);
    expect(about.querySelector('a')).toHaveAttribute('href', `/first-light/${day}`);
    expect(about.querySelector('a')).toHaveTextContent(`${t.firstLightWatch} →`);
    // Its controls are words and four arrows, each named for what it does.
    const names = [...exhibit.querySelectorAll('button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
    expect(names).toEqual([
      t.depthTurnLeft,
      t.depthTurnRight,
      t.depthTiltUp,
      t.depthTiltDown,
      t.depthOpen,
      t.play,
    ]);
    // The two chapters that speak of what is seen show it: a detail of each still, the work
    // itself and so with no label of an analysis.
    for (const [chapter, expression, word] of [
      ['stroke', 'light', t.light],
      ['paper', 'ink', t.ink],
    ] as const) {
      const detail = html.querySelector(`#${chapter} figure[data-detail="${expression}"]`)!;
      expect(detail.querySelector('img')).toHaveAttribute(
        'alt',
        `№\u00a0${workFolio(day)} · ${word} · ${t.detail}`,
      );
      expect(detail.querySelector('img')).toHaveAttribute('loading', 'lazy');
      expect(detail.querySelector('figcaption')).toHaveTextContent(t.detail);
      expect(detail.querySelector('figcaption')).not.toHaveTextContent(t.analysisNotWork);
      // The frame shows a window a third of the picture wide: the still lies three times as wide.
      expect(detail.querySelector('img')!.getAttribute('style')).toMatch(/width:\s*300%/);
    }
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
    const recorded = ESSAY.flatMap(({ blocks }) => blocks).filter(({ kind }) => kind === 'record');
    expect(recorded.length).toBeGreaterThan(2);
    expect(records.map((label) => spaced(label.textContent))).toEqual(
      Array(recorded.length).fill(`From the record of № ${workFolio(facts.id)}`),
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
      // The plate, the cover, three plates and the spectrum, the two lists, the close, the cycle.
      expect(html.querySelectorAll('main > section'), locale).toHaveLength(ESSAY.length + 10);
      expect(html.querySelectorAll('figure[data-figure]'), locale).toHaveLength(8);
      expect(html.querySelector('#sources ol')!.children, locale).toHaveLength(SOURCE_ORDER.length);
      expect(html.querySelector('h1'), locale).toHaveTextContent(t.processTitle);
      for (const { id, title } of ESSAY)
        expect(html.querySelector(`#${id}-title`), `${id} in ${locale}`).toHaveTextContent(
          t[title],
        );
    }
  }, 60_000);

  it('takes its examples from a work the registries have measured, whichever opens the day', () => {
    // The stand-in for an unmeasured work is never needed: every work of the pool has its facts.
    for (const id of DAY_WORK_POOL)
      expect(essayFacts(id, 'en', catalogs.en)?.id, `№ ${id}`).toBe(id);
  });

  it('describes itself to a search as what it is, under the venue’s line, in the reader’s language', async () => {
    for (const locale of locales) {
      const result = await generateMetadata({ params: Promise.resolve({ locale }) });
      expect(result.title, locale).toBe(messages(locale).shapeOfMotion);
      expect(result.openGraph?.title, locale).toBe(messages(locale).shapeOfMotion);
      // What the page is, in a search engine's two lines: no blank, and short enough to be whole.
      const description = messages(locale).homeDescription;
      expect(result.description, locale).toBe(description);
      expect(description, locale).not.toMatch(/\{|\[\^/);
      expect(description.length, locale).toBeLessThanOrEqual(160);
      if (locale !== 'en') expect(description, locale).not.toBe(catalogs.en.homeDescription);
    }
    const japanese = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    // One phrase, with no Latin space set inside it.
    expect(japanese.title).toBe('運動のかたち。');
    expect(japanese.alternates?.canonical).toBe('https://cosmic.art/ja');
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({});
    await expect(Home({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
