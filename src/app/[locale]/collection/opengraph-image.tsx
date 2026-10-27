import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { en } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex } from '@/lib/art/collection-index';
import { getInterpretation, rungFor } from '@/lib/art/types';
import { CARD, SharingCard, cardFonts, verifiedPicture } from '@/components/sharing-card';

/** The collection's card: three plates side by side on paper and the count from the index. */
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
  const pictures = await Promise.all(
    [23, 31, 35].flatMap((id) => {
      const media = getInterpretation(getCuratedArtwork(id)!, 'ink');
      const rung = rungFor(media?.rungs, 400);
      return rung
        ? [
            verifiedPicture(rung.src, rung.sha256).then((dataUrl) => ({
              dataUrl,
              width: rung.width,
              height: rung.height,
            })),
          ]
        : [];
    }),
  );
  if (pictures.length === 0) notFound();
  const words = fill(t.sharingCollection, {
    count: new Intl.NumberFormat(locale).format(collectionIndex.total),
  });
  return new ImageResponse(
    <SharingCard
      ground="#f1ebdf"
      night={false}
      pictures={pictures}
      label={t.collection}
      words={words}
    />,
    { ...size, fonts: await cardFonts(locale, `${t.collection} ${words}`) },
  );
}
