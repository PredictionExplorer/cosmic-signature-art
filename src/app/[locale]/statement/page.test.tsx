import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { uk } from '@/lib/i18n/uk';
import { collectionIndex, cycles } from '@/lib/art/collection-index';
import Statement, { collectionCounts, generateMetadata } from './page';

describe('the statement', () => {
  it('reads its counts from the index rather than from copy', () => {
    const summaries = cycles();
    // Each phrase keeps its figure: its spaces are no-break spaces, read here as plain spaces.
    const line = collectionCounts('en', en).replace(/\u00a0/g, ' ');
    expect(line).toContain(en.livingCollection);
    expect(line).toContain(`Cycle ${summaries[0].cycle} to Cycle ${summaries.at(-1)!.cycle}`);
    expect(line).toContain(`${collectionIndex.total} works`);
    expect(line).toContain('since June 2026');
    expect(collectionCounts('en', en)).toContain(`Cycle\u00a0${summaries[0].cycle}`);
  });

  it('dates the collection in Ukrainian without a month in the wrong case', () => {
    // «з {date}» was filled with a nominative month: «з червень 2026 р.». After «з» the month
    // is genitive, which the formatter does not give without a day, so the line names the
    // start as it names the count beside it: «Роботи: 72 · Початок: червень 2026 р.»
    const line = collectionCounts('uk', uk).replace(/\u00a0/g, ' ');
    expect(line).toContain('Початок: червень 2026 р.');
    expect(line).not.toMatch(/\sз червень/);
    expect(line).toContain(`Роботи: ${collectionIndex.total}`);
  });

  it('sets the wordmark, the six sections, the byline and the one way onward', async () => {
    render(await Statement({ params: Promise.resolve({ locale: 'en' }) }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cosmic Signature');
    expect(screen.getByText(en.oneMotion)).toBeVisible();
    expect(screen.getByText(en.shapeOfMotion)).toBeVisible();
    for (const n of [1, 2, 3, 4, 5, 6] as const) {
      const section = screen.getByRole('region', { name: `§ ${n}` });
      expect(section).toHaveTextContent(en[`statement${n}`]);
    }
    expect(screen.getByText(en.statementSigned)).toBeVisible();
    // A signed text that has changed says so, under its byline.
    expect(screen.getByText(en.statementCorrected)).toBeVisible();
    expect(en.statementCorrected).toBe('Corrected November 2026: § 3 and § 6.');
    expect(screen.getByRole('link', { name: `${en.collection} →` })).toHaveAttribute(
      'href',
      '/collection',
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    expect(metadata.alternates?.canonical).toBe('https://cosmic.art/ja/statement');
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({});
  });
});
