import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';

vi.mock('server-only', () => ({}));
const { CARD, SharingCard, cardFonts, verifiedPicture } = await import('./sharing-card');

describe('the sharing card', () => {
  it('draws a verified rung as a lossless PNG and refuses bytes that do not match their hash', async () => {
    const ink = getInterpretation(getCuratedArtwork(31)!, 'ink')!;
    const rung = ink.rungs!.find((candidate) => candidate.width === 1280)!;
    const picture = await verifiedPicture(rung.src, rung.sha256);
    expect(picture.startsWith('data:image/png;base64,')).toBe(true);
    expect(picture.length).toBeGreaterThan(100_000);
    await expect(verifiedPicture(rung.src, 'a'.repeat(64))).rejects.toThrow(/does not hash/);
  });

  it('sets the card in the static faces the site also ships, with a slice for the numero sign', async () => {
    const fonts = await cardFonts();
    expect(fonts?.map((font) => `${font.name} ${font.weight}`)).toEqual([
      'Literata 400',
      'Literata 300',
      'Literata Numero 300',
      'IBM Plex Mono 400',
    ]);
    for (const font of fonts ?? []) expect((font.data as Buffer).length).toBeGreaterThan(10_000);
  });

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
    expect(CARD).toEqual({ width: 1200, height: 630 });
    const night = renderToStaticMarkup(
      <SharingCard ground="#000000" night pictures={[]} label="Collection" />,
    );
    expect(night).toContain('color:#f1ebdf');
    expect(night).not.toContain('Literata Numero');
  });
});
