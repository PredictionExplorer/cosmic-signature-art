import { describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { catalogs } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation, rungFor, type ArtInterpretation } from '@/lib/art/types';
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
/** A picture that names the rung it was drawn from, so a card's choice of file can be read. */
const named = (src: string) => `data:image/png;base64,${Buffer.from(src).toString('base64')}`;
vi.mock('@/components/sharing-card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/sharing-card')>()),
  cardFonts: (locale?: string, text?: string) => fonts(locale, text),
  verifiedPicture: async (src: string) => named(src),
  expressionPicture: async (media: ArtInterpretation, width: number) => {
    const rung = rungFor(media.rungs, width);
    return rung ? { dataUrl: named(rung.src), width: rung.width, height: rung.height } : undefined;
  },
}));

const work = await import('./art/[id]/opengraph-image');
const home = await import('./opengraph-image');
const collection = await import('./collection/opengraph-image');
const params = <T extends Record<string, string>>(values: T) => ({
  params: Promise.resolve(values),
});
type Picture = { dataUrl: string; width: number; height: number };
/** The pair card's props: the Ink leaf and the Light leaf across the seam. */
const pair = (response: unknown) =>
  (response as unknown as FakeImageResponse).element.props as {
    leaves: { ground: string; night: boolean; picture: Picture; label?: string }[];
    words?: string;
    monogram?: string;
  };
const drawnFrom = (picture: Picture) =>
  Buffer.from(picture.dataUrl.split(',')[1], 'base64').toString();

describe('the sharing cards', () => {
  it("draws a work's card as its pair across the seam, each from its own rung on its measured ground", async () => {
    const response = await work.default(params({ locale: 'ja', id: '31' }));
    const card = pair(response);
    const archived = getCuratedArtwork(31)!;
    const [ink, light] = card.leaves;
    expect(ink.ground).toBe('#efe9dd');
    expect(ink.night).toBe(false);
    expect(ink.label).toBe(`№\u00a0031 · ${catalogs.ja.ink}`);
    expect(light.ground).toBe('#000000');
    expect(light.night).toBe(true);
    expect(light.label).toBe(catalogs.ja.light);
    expect(card.words).toBe('Orbit Ribbons · Harmonic Weave');
    expect(card.monogram).toBe(`${catalogs.ja.seedShort} 0x4a0d…f5b5`);
    // Each half is drawn from the smallest rung that fills it.
    for (const [leaf, expression] of [
      [ink, 'ink'],
      [light, 'light'],
    ] as const) {
      const rung = rungFor(getInterpretation(archived, expression)!.rungs, 560)!;
      expect(leaf.picture.width).toBe(rung.width);
      expect(drawnFrom(leaf.picture)).toBe(rung.src);
    }
    expect((response as unknown as FakeImageResponse).options).toMatchObject({
      width: 1200,
      height: 630,
    });
    expect(fonts).toHaveBeenLastCalledWith('ja', expect.stringContaining(catalogs.ja.light));
    const [meta] = await work.generateImageMetadata(params({ locale: 'en', id: '31' }));
    expect(meta.alt).toBe('№\u00a0031 · Ink · Light');
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

  it("draws the venue's card as the day's work's pair with the statement line", async () => {
    const response = await home.default(params({ locale: 'vi' }));
    const card = pair(response);
    const [ink, light] = card.leaves;
    expect(ink.label).toBe(
      `№\u00a0${String(workOfTheDay()).padStart(3, '0')} · ${catalogs.vi.ink}`,
    );
    expect(ink.night).toBe(false);
    expect(light.label).toBe(catalogs.vi.light);
    expect(light.night).toBe(true);
    expect(card.words).toBe(catalogs.vi.statementLine);
    expect(fonts).toHaveBeenLastCalledWith(
      'vi',
      expect.stringContaining(catalogs.vi.statementLine),
    );
    expect(home.revalidate).toBe(300);
    await expect(home.default(params({ locale: 'xx' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it("draws the collection's card on its two grounds with the count from the index", async () => {
    const response = await collection.default(params({ locale: 'en' }));
    const card = pair(response);
    const [ink, light] = card.leaves;
    expect(ink.label).toBe(en.collection);
    expect(ink.night).toBe(false);
    expect(light.night).toBe(true);
    expect(light.label).toBeUndefined();
    expect(card.words).toBe(`Collection · ${collectionIndex.total} works`);
    const [meta] = await collection.generateImageMetadata(params({ locale: 'ko' }));
    expect(meta.alt).toBe(`${catalogs.ko.collection} · Cosmic Signature`);
  });
});
