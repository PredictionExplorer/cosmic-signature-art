import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { en } from '@/lib/i18n/en';
import { indexedWork, indexedAssetUrl } from '@/lib/art/collection-index';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { getPlateGround } from '@/lib/art/plate-records';
import { parseArtworkId } from '@/lib/art/validation';
import { workNumber } from '@/lib/art/number';
import { getInterpretation, rungFor } from '@/lib/art/types';
import { CARD, SharingCard, cardFonts, verifiedPicture } from '@/components/sharing-card';

/**
 * The work's sharing card: its Ink plate (the 1280 rung, hash-verified) on its measured
 * ground, "№ 031 · Ink", the structure and underlay words, and the seed as a monogram.
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
      alt: tokenId === null ? 'Cosmic Signature' : `${workNumber(tokenId)} · ${t.ink}`,
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
  const media = getInterpretation(work, 'ink') ?? work.media[0];
  if (!media?.still) notFound();
  const rung = rungFor(media.rungs, 760);
  const preview = indexed.media[media.id === 'light' ? 'light' : 'ink']?.preview;
  const picture = rung
    ? {
        dataUrl: await verifiedPicture(rung.src, rung.sha256),
        width: rung.width,
        height: rung.height,
      }
    : preview?.sha256
      ? {
          dataUrl: await verifiedPicture(indexedAssetUrl(indexed, preview.path)!, preview.sha256),
          width: preview.width ?? 640,
          height: preview.height ?? 414,
        }
      : undefined;
  if (!picture) notFound();
  const night = media.id === 'light';
  const ground =
    getPlateGround(work.id, media.id, media.stillSha256)?.tone ?? (night ? '#000000' : '#f1ebdf');
  const word = media.id === 'ink' ? t.ink : media.id === 'light' ? t.light : media.label;
  const words = [indexed.traits.structure, indexed.traits.underlay].filter(Boolean).join(' · ');
  return new ImageResponse(
    <SharingCard
      ground={ground}
      night={night}
      pictures={[picture]}
      label={`${workNumber(work.id)} · ${word}`}
      words={words}
      monogram={`${t.seedShort} ${indexed.seed.slice(0, 6)}…${indexed.seed.slice(-4)}`}
    />,
    { ...size, fonts: await cardFonts() },
  );
}
