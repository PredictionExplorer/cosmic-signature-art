import { describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { catalogs } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { collectionIndex } from '@/lib/art/collection-index';

/** The rasteriser is replaced by a box that keeps what it was handed. */
class FakeImageResponse {
  constructor(
    public element: React.ReactElement,
    public options: { width: number; height: number; fonts?: unknown[] },
  ) {}
}
vi.mock('next/og', () => ({ ImageResponse: FakeImageResponse }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('server-only', () => ({}));
const fonts = vi.fn(async (locale?: string, text?: string) => [{ locale, text }]);
vi.mock('@/components/sharing-card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/sharing-card')>()),
  cardFonts: (locale?: string, text?: string) => fonts(locale, text),
  verifiedPicture: async (src: string) =>
    `data:image/png;base64,${Buffer.from(src).toString('base64')}`,
}));

const work = await import('./art/[id]/opengraph-image');
const home = await import('./opengraph-image');
const collection = await import('./collection/opengraph-image');
const params = <T extends Record<string, string>>(values: T) => ({
  params: Promise.resolve(values),
});
const props = (response: unknown) =>
  (response as unknown as FakeImageResponse).element.props as {
    ground: string;
    night: boolean;
    pictures: { dataUrl: string; width: number; height: number }[];
    label: string;
    words?: string;
    monogram?: string;
  };

describe('the sharing cards', () => {
  it("draws a work's card from its own rung on its measured ground, in the visitor's words", async () => {
    const response = await work.default(params({ locale: 'ja', id: '31' }));
    const card = props(response);
    const ink = getInterpretation(getCuratedArtwork(31)!, 'ink')!;
    expect(card.ground).toBe('#efe9dd');
    expect(card.night).toBe(false);
    expect(card.label).toBe(`№ 031 · ${catalogs.ja.ink}`);
    expect(card.words).toBe('Orbit Ribbons · Harmonic Weave');
    expect(card.monogram).toBe(`${catalogs.ja.seedShort} 0x4a0d…f5b5`);
    expect(card.pictures).toHaveLength(1);
    expect(card.pictures[0].width).toBe(1280);
    expect(Buffer.from(card.pictures[0].dataUrl.split(',')[1], 'base64').toString()).toBe(
      ink.rungs!.find((rung) => rung.width === 1280)!.src,
    );
    expect((response as unknown as FakeImageResponse).options).toMatchObject({
      width: 1200,
      height: 630,
    });
    expect(fonts).toHaveBeenLastCalledWith('ja', expect.stringContaining(catalogs.ja.ink));
    const [meta] = await work.generateImageMetadata(params({ locale: 'en', id: '31' }));
    expect(meta.alt).toBe('№ 031 · Ink');
  });

  it('is not drawn for a work that is not indexed or a locale the venue does not speak', async () => {
    await expect(work.default(params({ locale: 'en', id: '99999' }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    await expect(work.default(params({ locale: 'xx', id: '31' }))).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    const [meta] = await work.generateImageMetadata(params({ locale: 'en', id: 'nope' }));
    expect(meta.alt).toBe('Cosmic Signature');
  });

  it("draws the venue's card from the day's work with the statement line", async () => {
    const response = await home.default(params({ locale: 'vi' }));
    const card = props(response);
    expect(card.label).toBe(`№ ${String(workOfTheDay()).padStart(3, '0')} · ${catalogs.vi.ink}`);
    expect(card.words).toBe(catalogs.vi.statementLine);
    expect(card.night).toBe(false);
    expect(card.pictures[0].width).toBe(1280);
    expect(fonts).toHaveBeenLastCalledWith(
      'vi',
      expect.stringContaining(catalogs.vi.statementLine),
    );
    expect(home.revalidate).toBe(300);
    await expect(home.default(params({ locale: 'xx' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it("draws the collection's card from three plates with the count from the index", async () => {
    const response = await collection.default(params({ locale: 'en' }));
    const card = props(response);
    expect(card.label).toBe(en.collection);
    expect(card.words).toBe(`Collection · ${collectionIndex.total} works`);
    expect(card.pictures).toHaveLength(3);
    expect(card.pictures.every((picture) => picture.width === 1280)).toBe(true);
    const [meta] = await collection.generateImageMetadata(params({ locale: 'ko' }));
    expect(meta.alt).toBe(`${catalogs.ko.collection} · Cosmic Signature`);
  });
});
