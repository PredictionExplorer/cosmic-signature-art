import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/en';
import { collectionIndex, cycles } from '@/lib/art/collection-index';
import Statement, { collectionCounts, generateMetadata } from './page';

describe('the statement', () => {
  it('reads its counts from the index rather than from copy', () => {
    const summaries = cycles();
    const line = collectionCounts('en', en);
    expect(line).toContain(en.livingCollection);
    expect(line).toContain(`Cycle ${summaries[0].cycle} to Cycle ${summaries.at(-1)!.cycle}`);
    expect(line).toContain(`${collectionIndex.total} works`);
    expect(line).toContain('since June 2026');
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
    expect(screen.getByRole('link', { name: `${en.collection} →` })).toHaveAttribute(
      'href',
      '/collection',
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'ja' }) });
    expect(metadata.alternates?.canonical).toBe('https://cosmic.art/ja/statement');
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'xx' }) })).toEqual({});
  });
});
