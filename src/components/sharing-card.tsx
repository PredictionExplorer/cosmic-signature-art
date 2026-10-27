import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageResponse } from 'next/og';
import { DEPLOYMENT_URL } from '@/lib/site';

/**
 * The sharing card: the work on its own measured ground, the one label line, the wordmark
 * and the seed as a monogram, composed for the 1200 × 630 frame social crawlers fetch. The
 * plate bytes are the venue's hash-verified rungs, read from the deployment and checked
 * against the registry before they are drawn; nothing is tinted or cropped. Satori needs
 * static faces, so the card is set in the static Literata and Plex Mono the site also ships.
 */
export const CARD = { width: 1200, height: 630 };
type Fonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];

/**
 * The Latin faces, and the Cyrillic slice under its own family name, because that slice is
 * where Literata keeps the numero sign and the rasteriser takes glyphs from one family only.
 */
export async function cardFonts(): Promise<Fonts> {
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
  return [
    { name: 'Literata', weight: 400, style: 'normal', data: book },
    { name: 'Literata', weight: 300, style: 'normal', data: light },
    { name: 'Literata Numero', weight: 300, style: 'normal', data: numero },
    { name: 'IBM Plex Mono', weight: 400, style: 'normal', data: mono },
  ];
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
        padding: 48,
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
          marginLeft: 48,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 300, letterSpacing: 1 }}>
          Cosmic Signature
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 300, lineHeight: 1.1 }}>
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
                fontSize: 22,
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
            fontSize: 18,
            color: colours.muted,
          }}
        >
          {monogram ?? ''}
        </div>
      </div>
    </div>
  );
}
