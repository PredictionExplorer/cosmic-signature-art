import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageResponse } from 'next/og';
import { DEPLOYMENT_URL } from '@/lib/site';
import type { Locale } from '@/lib/i18n/routing';

/**
 * The sharing card: the work on its own measured ground, the one label line, the wordmark
 * and the seed as a monogram, composed for the 1200 × 630 frame social crawlers fetch. The
 * plate bytes are the venue's hash-verified rungs, read from the deployment and checked
 * against the registry before they are drawn; nothing is tinted or cropped. The rasteriser
 * needs static faces, so the card is set in the static Literata and Plex Mono the site also
 * ships, and in each CJK locale's own sliced display face. The type is the site's scale at
 * twice its size for the 1200 px frame: 24 / 30 / 36.
 */
export const CARD = { width: 1200, height: 630 };
type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];

/** The sliced display face each CJK locale reads in, from the packages the site already ships. */
const LOCALE_FACES: Partial<Record<Locale, { package: string; family: string }>> = {
  zh: { package: 'noto-serif-sc', family: 'Noto Serif SC' },
  'zh-TW': { package: 'noto-serif-tc', family: 'Noto Serif TC' },
  'zh-HK': { package: 'noto-serif-hk', family: 'Noto Serif HK' },
  ja: { package: 'shippori-mincho-b1', family: 'Shippori Mincho B1' },
  ko: { package: 'gowun-batang', family: 'Gowun Batang' },
};
const fontsource = (...segments: string[]) =>
  join(/* turbopackIgnore: true */ process.cwd(), 'node_modules/@fontsource', ...segments);

/** One `@font-face` of a vendor-sliced stylesheet: its woff file and the code points it carries. */
export interface FontSlice {
  file: string;
  ranges: [number, number][];
}

/** The slices a fontsource stylesheet declares, in order. */
export function parseSlices(css: string): FontSlice[] {
  return css
    .split(/(?=@font-face)/)
    .filter((block) => block.includes('@font-face'))
    .flatMap((block) => {
      const file = /url\(\.\/files\/([^)]+\.woff)\) format\('woff'\)/.exec(block)?.[1];
      const ranges = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
      if (!file || !ranges) return [];
      return [
        {
          file,
          ranges: ranges.split(',').map((range): [number, number] => {
            const [from, to] = range.trim().replace(/^U\+/i, '').split('-');
            return [parseInt(from, 16), parseInt(to ?? from, 16)];
          }),
        },
      ];
    });
}

/** Literata carries everything below the CJK radicals: Latin, Cyrillic, the punctuation, the numero sign. */
export const CJK_FROM = 0x2e80;

/**
 * The slices that carry the code points of `text` from the CJK radicals up, each once, in
 * stylesheet order; the Latin, digits and punctuation on a card are Literata's.
 */
export function slicesFor(slices: FontSlice[], text: string, from = CJK_FROM): FontSlice[] {
  const needed = new Set<FontSlice>();
  for (const character of new Set(text)) {
    const point = character.codePointAt(0)!;
    if (point < from) continue;
    const slice = slices.find((candidate) =>
      candidate.ranges.some(([from, to]) => point >= from && point <= to),
    );
    if (slice) needed.add(slice);
  }
  return slices.filter((slice) => needed.has(slice));
}

/**
 * The faces a card needs: the Latin Literata and Plex Mono, the Cyrillic slice under its own
 * family name because that slice is where Literata keeps the numero sign and the rasteriser
 * takes a named family's glyphs from one file, Literata's Vietnamese slice for vi, and for a
 * CJK locale only the slices of its own display face that the card's text touches. Every
 * loaded face is a fallback for every glyph, so nothing is fetched at render time.
 */
export async function cardFonts(locale: Locale = 'en', text = ''): Promise<Fonts> {
  // Each path is a literal, so the bundler traces exactly these files into the server output.
  const [book, light, numero, mono] = await Promise.all([
    readFile(
      join(process.cwd(), 'node_modules/@fontsource/literata/files/literata-latin-400-normal.woff'),
    ),
    readFile(
      join(process.cwd(), 'node_modules/@fontsource/literata/files/literata-latin-300-normal.woff'),
    ),
    readFile(
      join(
        process.cwd(),
        'node_modules/@fontsource/literata/files/literata-cyrillic-300-normal.woff',
      ),
    ),
    readFile(
      join(
        process.cwd(),
        'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff',
      ),
    ),
  ]);
  const fonts: NonNullable<Fonts> = [
    { name: 'Literata', weight: 400, style: 'normal', data: book },
    { name: 'Literata', weight: 300, style: 'normal', data: light },
    { name: 'Literata Numero', weight: 300, style: 'normal', data: numero },
    { name: 'IBM Plex Mono', weight: 400, style: 'normal', data: mono },
  ];
  if (locale === 'vi') {
    const [regular, thin] = await Promise.all([
      readFile(
        join(
          process.cwd(),
          'node_modules/@fontsource/literata/files/literata-vietnamese-400-normal.woff',
        ),
      ),
      readFile(
        join(
          process.cwd(),
          'node_modules/@fontsource/literata/files/literata-vietnamese-300-normal.woff',
        ),
      ),
    ]);
    fonts.push(
      { name: 'Literata Vietnamese', weight: 400, style: 'normal', data: regular },
      { name: 'Literata Vietnamese', weight: 300, style: 'normal', data: thin },
    );
  }
  const face = LOCALE_FACES[locale];
  if (face) {
    // The sliced faces are read by name at render time; next.config.ts traces them into the output.
    const slices = slicesFor(await parseSlicesOf(face.package), text);
    const files = await Promise.all(
      slices.map((slice) => readFile(fontsource(face.package, 'files', slice.file))),
    );
    files.forEach((data, index) =>
      fonts.push({ name: `${face.family} ${index + 1}`, weight: 400, style: 'normal', data }),
    );
  }
  return fonts;
}

const sliceTables = new Map<string, Promise<FontSlice[]>>();
function parseSlicesOf(pkg: string): Promise<FontSlice[]> {
  let table = sliceTables.get(pkg);
  if (!table) {
    table = readFile(fontsource(pkg, '400.css'), 'utf8').then(parseSlices);
    sliceTables.set(pkg, table);
  }
  return table;
}

/**
 * A published derivative as a data URL, verified against its recorded hash. A local path is
 * read from public/ where the filesystem has it and fetched from the deployment where it
 * does not; a mismatch is refused, never drawn. The rasteriser reads PNG and JPEG only, so
 * a WebP rung is unpacked losslessly to PNG after the check: the same pixels, another box.
 */
export async function verifiedPicture(src: string, sha256: string): Promise<string> {
  let bytes: Buffer;
  if (/^https?:\/\//.test(src)) {
    bytes = Buffer.from(await (await fetch(src)).arrayBuffer());
  } else {
    try {
      // Not traced into the server bundle: public/ is the CDN's, and the fetch below is the fallback.
      bytes = await readFile(join(/* turbopackIgnore: true */ process.cwd(), 'public', src));
    } catch {
      bytes = Buffer.from(await (await fetch(new URL(src, DEPLOYMENT_URL))).arrayBuffer());
    }
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== sha256)
    throw new Error(`${src} does not hash to its recorded ${sha256.slice(0, 12)}…`);
  if (/\.webp(?:\?|#|$)/i.test(src)) {
    const { default: sharp } = await import('sharp');
    const png = await sharp(bytes).png({ compressionLevel: 6 }).toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }
  const type = /\.png(?:\?|#|$)/i.test(src) ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${bytes.toString('base64')}`;
}

export interface CardPicture {
  dataUrl: string;
  width: number;
  height: number;
}

/** The venue's two grounds give the card its type colours. */
function palette(night: boolean) {
  return night ? { type: '#f1ebdf', muted: '#b8b5ad' } : { type: '#22231f', muted: '#68685e' };
}

export function SharingCard({
  ground,
  night,
  pictures,
  label,
  words,
  monogram,
}: {
  /** The measured tone the plate letterboxes in. */
  ground: string;
  night: boolean;
  pictures: CardPicture[];
  /** The one label line: "№ 031 · Ink". */
  label: string;
  /** The words beneath it: the structure and underlay, or the statement line. */
  words?: string;
  /** "Seed 0x4a0d…f5b5", set in mono. */
  monogram?: string;
}) {
  const colours = palette(night);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: ground,
        color: colours.type,
        fontFamily: 'Literata',
        padding: 54,
      }}
    >
      <div style={{ flex: 1, display: 'flex', gap: 2, minWidth: 0 }}>
        {pictures.map((picture, index) => (
          <div
            key={index}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 0,
            }}
          >
            <img
              src={picture.dataUrl}
              width={picture.width}
              height={picture.height}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          width: 330,
          marginLeft: 54,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* The wordmark as the site sets it: small capitals at the folio stop, twice over for 1200 px. */}
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Cosmic Signature
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 36, fontWeight: 300, lineHeight: 1.2 }}>
            {label.startsWith('№') ? (
              <>
                <span style={{ fontFamily: 'Literata Numero' }}>№</span>
                <span style={{ marginLeft: 12 }}>{label.slice(1).trimStart()}</span>
              </>
            ) : (
              label
            )}
          </div>
          {words ? (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                lineHeight: 1.4,
                color: colours.muted,
              }}
            >
              {words}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'IBM Plex Mono',
            fontSize: 24,
            color: colours.muted,
          }}
        >
          {monogram ?? ''}
        </div>
      </div>
    </div>
  );
}
