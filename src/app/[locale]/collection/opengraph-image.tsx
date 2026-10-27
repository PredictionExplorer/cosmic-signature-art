import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { collectionIndex } from '@/lib/art/collection-index';
import { rungFor } from '@/lib/art/still-ladder';
import { getInterpretation } from '@/lib/art/types';
import { CARD, SharingCard, cardFonts, verifiedPicture } from '@/components/sharing-card';

/** The collection's card: three plates side by side on paper and the count from the index. */
export const alt = 'Cosmic Signature · Collection';
export const size = CARD;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
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
  return new ImageResponse(
    <SharingCard
      ground="#f1ebdf"
      night={false}
      pictures={pictures}
      label={t.collection}
      words={fill(t.sharingCollection, {
        count: new Intl.NumberFormat(locale).format(collectionIndex.total),
      })}
    />,
    { ...size, fonts: await cardFonts() },
  );
}
