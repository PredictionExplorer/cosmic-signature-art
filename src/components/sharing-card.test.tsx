// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { catalogs } from '@/lib/i18n/messages';

vi.mock('server-only', () => ({}));
const { CARD, SharingCard, cardFonts, parseSlices, slicesFor, verifiedPicture } =
  await import('./sharing-card');

const names = (fonts: Awaited<ReturnType<typeof cardFonts>>) =>
  fonts?.map((font) => `${font.name} ${font.weight}`) ?? [];

describe('the sharing card', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws a verified rung as a lossless PNG and refuses bytes that do not match their hash', async () => {
    const ink = getInterpretation(getCuratedArtwork(31)!, 'ink')!;
    const rung = ink.rungs!.find((candidate) => candidate.width === 1280)!;
    const picture = await verifiedPicture(rung.src, rung.sha256);
    expect(picture.startsWith('data:image/png;base64,')).toBe(true);
    expect(picture.length).toBeGreaterThan(100_000);
    await expect(verifiedPicture(rung.src, 'a'.repeat(64))).rejects.toThrow(/does not hash/);
  });

  it('sets the card in the static faces the site also ships, with a slice for the numero sign', async () => {
    const fonts = await cardFonts('en', '№ 031 · Ink');
    expect(names(fonts)).toEqual([
      'Literata 400',
      'Literata 300',
      'Literata Numero 300',
      'IBM Plex Mono 400',
    ]);
    for (const font of fonts ?? []) expect((font.data as Buffer).length).toBeGreaterThan(10_000);
  });

  it('reads a sliced stylesheet and picks only the slices the text touches', () => {
    const css = `/* a */
@font-face {
  font-family: 'Face';
  src: url(./files/face-0-400-normal.woff2) format('woff2'), url(./files/face-0-400-normal.woff) format('woff');
  unicode-range: U+4e00-4e0f,U+9f00;
}
@font-face {
  font-family: 'Face';
  src: url(./files/face-1-400-normal.woff2) format('woff2'), url(./files/face-1-400-normal.woff) format('woff');
  unicode-range: U+30a0-30ff;
}
@font-face {
  font-family: 'Face';
  src: url(./files/face-2-400-normal.woff2) format('woff2');
  unicode-range: U+0041;
}`;
    const slices = parseSlices(css);
    expect(slices.map((slice) => slice.file)).toEqual([
      'face-0-400-normal.woff',
      'face-1-400-normal.woff',
    ]);
    expect(slices[0].ranges).toEqual([
      [0x4e00, 0x4e0f],
      [0x9f00, 0x9f00],
    ]);
    expect(slicesFor(slices, 'インク').map((slice) => slice.file)).toEqual([
      'face-1-400-normal.woff',
    ]);
    expect(slicesFor(slices, '一 インク').map((slice) => slice.file)).toEqual([
      'face-0-400-normal.woff',
      'face-1-400-normal.woff',
    ]);
    expect(slicesFor(slices, 'Ink · 031')).toEqual([]);
  });

  it("loads each CJK locale's own face for the glyphs on the card, and Literata's Vietnamese slice", async () => {
    const ja = await cardFonts('ja', `№ 031 · ${catalogs.ja.ink} ${catalogs.ja.seedShort}`);
    expect(names(ja).slice(0, 4)).toEqual(names(await cardFonts('en')));
    expect(
      names(ja)
        .slice(4)
        .every((name) => /^Shippori Mincho B1 \d+ 400$/.test(name)),
    ).toBe(true);
    expect(ja!.length).toBeGreaterThan(4);
    const ko = await cardFonts('ko', catalogs.ko.ink);
    expect(names(ko).some((name) => name.startsWith('Gowun Batang '))).toBe(true);
    const zh = await cardFonts('zh-TW', catalogs['zh-TW'].ink);
    expect(names(zh).some((name) => name.startsWith('Noto Serif TC '))).toBe(true);
    const vi = await cardFonts('vi', catalogs.vi.statementLine);
    expect(names(vi)).toEqual([
      ...names(await cardFonts('en')),
      'Literata Vietnamese 400',
      'Literata Vietnamese 300',
    ]);
    // Nothing is read for a face the text does not touch.
    expect(names(await cardFonts('ja', 'Ink · 031'))).toEqual(names(await cardFonts('en')));
  });

  it('renders a Japanese and a Vietnamese card from the shipped faces alone, fetching nothing', async () => {
    // The rasteriser fetches its own module as a data URL; any other fetch would be a runtime font.
    const real = globalThis.fetch;
    const fetched = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith('data:')
        ? real(input, init)
        : Promise.reject(new Error('no runtime font')),
    );
    vi.stubGlobal('fetch', fetched);
    const { ImageResponse } = await import('next/og');
    for (const [locale, label, words, monogram] of [
      [
        'ja',
        `№ 031 · ${catalogs.ja.ink}`,
        'Orbit Ribbons · Harmonic Weave',
        `${catalogs.ja.seedShort} 0x4a0d…f5b5`,
      ],
      [
        'vi',
        `№ 031 · ${catalogs.vi.ink}`,
        catalogs.vi.statementLine,
        `${catalogs.vi.seedShort} 0x4a0d…f5b5`,
      ],
    ] as const) {
      const response = new ImageResponse(
        <SharingCard
          ground="#efe9dd"
          night={false}
          pictures={[]}
          label={label}
          words={words}
          monogram={monogram}
        />,
        { ...CARD, fonts: await cardFonts(locale, `${label} ${words} ${monogram}`) },
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.length).toBeGreaterThan(10_000);
    }
    // A fetch here would name, in its URL, the text no shipped face could draw.
    expect(
      fetched.mock.calls.map((call) => String(call[0])).filter((url) => !url.startsWith('data:')),
    ).toEqual([]);
  }, 60_000);

  it('composes the plate on its ground with the label, the words and the monogram', () => {
    const html = renderToStaticMarkup(
      <SharingCard
        ground="#efe9dd"
        night={false}
        pictures={[{ dataUrl: 'data:image/png;base64,AA==', width: 1280, height: 828 }]}
        label="№ 031 · Ink"
        words="Orbit Ribbons · Harmonic Weave"
        monogram="Seed 0x4a0d…f5b5"
      />,
    );
    expect(html).toContain('background:#efe9dd');
    expect(html).toContain('color:#22231f');
    expect(html).toContain('<img src="data:image/png;base64,AA==" width="1280" height="828"');
    expect(html).toContain('font-family:Literata Numero">№</span>');
    expect(html).toContain('031 · Ink');
    expect(html).toContain('Orbit Ribbons · Harmonic Weave');
    expect(html).toContain('Seed 0x4a0d…f5b5');
    // The site's scale, twice over: the wordmark in small capitals at the folio stop.
    expect(html).toContain(
      'font-size:24px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase',
    );
    expect(html).toContain('font-size:36px');
    expect(html).toContain('font-size:30px');
    expect(CARD).toEqual({ width: 1200, height: 630 });
    const night = renderToStaticMarkup(
      <SharingCard ground="#000000" night pictures={[]} label="Collection" />,
    );
    expect(night).toContain('color:#f1ebdf');
    expect(night).not.toContain('Literata Numero');
  });
});
