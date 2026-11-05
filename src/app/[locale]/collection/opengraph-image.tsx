import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { en } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex } from '@/lib/art/collection-index';
import { getInterpretation } from '@/lib/art/types';
import {
  CARD,
  PairCard,
  cardFonts,
  cardGround,
  expressionPicture,
} from '@/components/sharing-card';

/**
 * The collection's card: the collection on its two grounds across the seam, 031 in Ink on
 * paper beside 035 in Light on night, and the count from the index.
 */
export const size = CARD;
export const contentType = 'image/png';
type Params = Promise<{ locale: string }>;

export async function generateImageMetadata({ params }: { params: Params }) {
  const { locale } = await params;
  const t = isLocale(locale) ? messages(locale) : en;
  return [{ id: 'card', alt: `${t.collection} · Cosmic Signature`, size, contentType }];
}

export default async function Image({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const ink = getInterpretation(getCuratedArtwork(31)!, 'ink');
  const light = getInterpretation(getCuratedArtwork(35)!, 'light');
  if (!ink || !light) notFound();
  const [inkPicture, lightPicture] = await Promise.all([
    expressionPicture(ink, 560),
    expressionPicture(light, 560),
  ]);
  if (!inkPicture || !lightPicture) notFound();
  const words = fill(t.sharingCollection, {
    count: new Intl.NumberFormat(locale).format(collectionIndex.total),
  });
  return new ImageResponse(
    <PairCard
      leaves={[
        { ground: cardGround(31, ink), night: false, picture: inkPicture, label: t.collection },
        { ground: cardGround(35, light), night: true, picture: lightPicture },
      ]}
      words={words}
    />,
    { ...size, fonts: await cardFonts(locale, `${t.collection} ${words}`) },
  );
}
