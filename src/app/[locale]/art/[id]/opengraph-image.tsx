import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { en } from '@/lib/i18n/en';
import { indexedWork, indexedAssetUrl } from '@/lib/art/collection-index';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import { getInterpretation } from '@/lib/art/types';
import {
  CARD,
  PairCard,
  SharingCard,
  cardFonts,
  cardGround,
  expressionPicture,
} from '@/components/sharing-card';
import { expressionWord } from '@/lib/i18n/format';

/**
 * The work's sharing card: its two expressions across the seam (third-physics-phase-d.md §2),
 * each a hash-verified rung on its measured ground, "№ 031 · Ink" and "Light", the structure
 * and underlay words and the seed as a monogram. A work that publishes one expression shows
 * that one alone, as the single card does.
 */
export const size = CARD;
export const contentType = 'image/png';
type Params = Promise<{ locale: string; id: string }>;

export async function generateImageMetadata({ params }: { params: Params }) {
  const { locale, id } = await params;
  const t = isLocale(locale) ? messages(locale) : en;
  const tokenId = parseArtworkId(id);
  return [
    {
      id: 'card',
      alt: tokenId === null ? 'Cosmic Signature' : `${workNumber(tokenId)} · ${t.ink} · ${t.light}`,
      size,
      contentType,
    },
  ];
}

export default async function Image({ params }: { params: Params }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const tokenId = parseArtworkId(id);
  const indexed = tokenId === null ? undefined : indexedWork(tokenId);
  if (!indexed) notFound();
  const work = artworkFromIndex(indexed);
  const drawn = await Promise.all(
    (['ink', 'light'] as const).map(async (expression) => {
      const media = getInterpretation(work, expression);
      const preview = indexed.media[expression]?.preview;
      const picture = media?.still
        ? await expressionPicture(media, 560, {
            src: indexedAssetUrl(indexed, preview?.path),
            sha256: preview?.sha256,
            width: preview?.width,
            height: preview?.height,
          })
        : undefined;
      return media && picture ? { media, picture } : undefined;
    }),
  );
  const leaves = drawn.filter((leaf) => leaf !== undefined);
  if (leaves.length === 0) notFound();
  const words = [indexed.traits.structure, indexed.traits.underlay].filter(Boolean).join(' · ');
  const monogram = `${t.seedShort} ${indexed.seed.slice(0, 6)}…${indexed.seed.slice(-4)}`;
  const number = workNumber(work.id);
  if (leaves.length === 2) {
    const [ink, light] = leaves;
    const inkLabel = `${number} · ${expressionWord(ink.media, t)}`;
    const lightLabel = expressionWord(light.media, t) ?? t.light;
    return new ImageResponse(
      <PairCard
        leaves={[
          {
            ground: cardGround(work.id, ink.media),
            night: false,
            picture: ink.picture,
            label: inkLabel,
          },
          {
            ground: cardGround(work.id, light.media),
            night: true,
            picture: light.picture,
            label: lightLabel,
          },
        ]}
        words={words}
        monogram={monogram}
      />,
      {
        ...size,
        fonts: await cardFonts(locale, `${inkLabel} ${lightLabel} ${words} ${monogram}`),
      },
    );
  }
  const [{ media, picture }] = leaves;
  const label = `${number} · ${expressionWord(media, t)}`;
  return new ImageResponse(
    <SharingCard
      ground={cardGround(work.id, media)}
      night={media.id === 'light'}
      pictures={[picture]}
      label={label}
      words={words}
      monogram={monogram}
    />,
    { ...size, fonts: await cardFonts(locale, `${label} ${words} ${monogram}`) },
  );
}
