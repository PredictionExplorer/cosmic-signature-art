import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { getPlateGround } from '@/lib/art/plate-records';
import { rungFor } from '@/lib/art/still-ladder';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { workNumber } from '@/lib/art/number';
import { getInterpretation } from '@/lib/art/types';
import { CARD, SharingCard, cardFonts, verifiedPicture } from '@/components/sharing-card';

/**
 * The venue's card, and the default for every page without one of its own: the day's work
 * in Ink on its ground with the statement line. It follows the home's five-minute cadence.
 */
export const revalidate = 300;
export const alt = 'Cosmic Signature';
export const size = CARD;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const work = getCuratedArtwork(workOfTheDay());
  const media = work ? getInterpretation(work, 'ink') : undefined;
  const rung = rungFor(media?.rungs, 760);
  if (!work || !media || !rung) notFound();
  const picture = {
    dataUrl: await verifiedPicture(rung.src, rung.sha256),
    width: rung.width,
    height: rung.height,
  };
  const indexed = indexedWork(work.id);
  return new ImageResponse(
    <SharingCard
      ground={getPlateGround(work.id, 'ink', media.stillSha256)?.tone ?? '#f1ebdf'}
      night={false}
      pictures={[picture]}
      label={`${workNumber(work.id)} · ${t.ink}`}
      words={t.statementLine}
      monogram={
        indexed ? `${t.seedShort} ${indexed.seed.slice(0, 6)}…${indexed.seed.slice(-4)}` : undefined
      }
    />,
    { ...size, fonts: await cardFonts() },
  );
}
