import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import registry from './sweep-spans.json' with { type: 'json' };
import { collectionIndex } from './collection-index';
import { withLocalDerivatives } from './derivatives';
import { artworkSharingImage } from './sharing';
import { activeSpan } from './spectral-sweep';
import { createSweepSpanLookup } from './sweep-spans';
import type { ArtFilm, ArtInterpretation, Artwork } from './types';

const seed = `0x${'a'.repeat(64)}` as const;
const film = 'c'.repeat(64);
const entry = {
  id: 7,
  seed,
  sweepSha256: film,
  firstLit: 16,
  lastLit: 26,
  start: 14,
  end: 28,
};
const document = (spans: unknown[]) => ({ schemaVersion: 1, measuredOn: '2026-11-05', spans });
const sweep: ArtFilm = {
  id: 'sweep',
  label: 'Spectral sweep',
  src: 'https://example.test/spectral_sweep.mp4',
  sourceSha256: film,
  mimeType: 'video/mp4',
  variantKey: '7:light:sweep',
  delivery: 'original-web',
};
const main: ArtFilm = { ...sweep, id: 'normal', label: 'Film', variantKey: '7:light:normal' };
const light: ArtInterpretation = {
  id: 'light',
  label: 'Light',
  still: '/light.webp',
  films: [main, sweep],
  source: 'published-manifest',
  availability: 'advertised',
};
const spanOf = (media: ArtInterpretation) => media.films.find((item) => item.id === 'sweep')?.span;

describe('the sweep spans', () => {
  it('bind to the Light sweep whose token, seed and film they were measured from', () => {
    const bind = createSweepSpanLookup(document([entry]));
    expect(spanOf(bind({ id: 7, seed }, light, 488))).toEqual({
      start: 14,
      end: 28,
      dominantNm: 488,
    });
    expect(spanOf(bind({ id: 7, seed }, light))).toEqual({ start: 14, end: 28 });
    // The film beside it, and the Ink, carry nothing.
    expect(bind({ id: 7, seed }, light).films[0].span).toBeUndefined();
    const ink = { ...light, id: 'ink', films: [{ ...sweep }] };
    expect(spanOf(bind({ id: 7, seed }, ink))).toBeUndefined();
  });

  it('drop a span another seed, another film or another token would borrow', () => {
    const bind = createSweepSpanLookup(document([entry]));
    const stale = { ...light, films: [main, { ...sweep, span: { start: 0, end: 63 } }] };
    expect(spanOf(bind({ id: 7, seed: `0x${'b'.repeat(64)}` }, stale))).toBeUndefined();
    expect(spanOf(bind({ id: 8, seed }, stale))).toBeUndefined();
    expect(spanOf(bind({ id: 7 }, stale))).toBeUndefined();
    const rerendered = { ...light, films: [main, { ...sweep, sourceSha256: 'd'.repeat(64) }] };
    expect(spanOf(bind({ id: 7, seed }, rerendered))).toBeUndefined();
  });

  it('refuse an entry whose span does not follow from its lit bins, a duplicate, or a malformed file', () => {
    expect(
      spanOf(createSweepSpanLookup(document([{ ...entry, start: 0 }]))({ id: 7, seed }, light)),
    ).toBeUndefined();
    expect(
      spanOf(createSweepSpanLookup(document([entry, entry]))({ id: 7, seed }, light)),
    ).toBeUndefined();
    expect(
      spanOf(createSweepSpanLookup({ spans: [entry] })({ id: 7, seed }, light)),
    ).toBeUndefined();
    // A work with no light at all sweeps the generator's fallback band.
    const dark = { ...entry, firstLit: null, lastLit: null, start: 4, end: 59 };
    expect(spanOf(createSweepSpanLookup(document([dark]))({ id: 7, seed }, light))).toEqual({
      start: 4,
      end: 59,
    });
  });

  it('are the published bins’ own: every entry derives from its lit bins and its index record', () => {
    expect(registry.spans).toHaveLength(collectionIndex.works.length);
    for (const span of registry.spans) {
      const work = collectionIndex.works.find((candidate) => candidate.id === span.id)!;
      expect(span.seed).toBe(work.seed);
      expect(span.sweepSha256).toBe(work.media.light?.films.sweep?.sha256);
      expect(activeSpan(span.firstLit ?? undefined, span.lastLit ?? undefined)).toEqual({
        start: span.start,
        end: span.end,
      });
    }
    const of = (id: number) => registry.spans.find((span) => span.id === id)!;
    // 031 sweeps the whole spectrum; 043's light lies between 460 and 515 nm, so its sweep does.
    expect([of(31).start, of(31).end]).toEqual([0, 63]);
    expect([of(43).start, of(43).end]).toEqual([14, 28]);
  });

  it('reach the room through the derivatives pass, with the work’s own dominant wavelength', () => {
    const work = collectionIndex.works.find((candidate) => candidate.id === 31)!;
    const published: ArtFilm = {
      ...sweep,
      src: 'https://a1.cosmicsignature.com/spectral_sweep.mp4',
      sourceSha256: work.media.light!.films.sweep!.sha256,
      variantKey: '31:light:sweep',
    };
    const [bound] = withLocalDerivatives({ id: 31, seed: work.seed as `0x${string}` }, [
      { ...light, films: [published] },
    ]);
    expect(spanOf(bound)).toEqual({ start: 0, end: 63, dominantNm: 632 });
  });

  it('never make the lens a page, a listing or a card: it lives in the room alone', () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);
    expect(paths.some((path) => /wavelength|sweep|spectral/i.test(path))).toBe(false);
    const artwork = {
      id: 31,
      media: [{ ...light, films: [{ ...sweep, span: { start: 0, end: 63 } }] }],
    } as unknown as Artwork;
    expect(artworkSharingImage(artwork, '№ 031')?.url).toBe('/light.webp');
  });
});
