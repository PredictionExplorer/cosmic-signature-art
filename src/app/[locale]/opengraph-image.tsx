import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { workNumber } from '@/lib/art/number';
import { getInterpretation } from '@/lib/art/types';
import {
  CARD,
  PairCard,
  cardFonts,
  cardGround,
  expressionPicture,
} from '@/components/sharing-card';

/**
 * The venue's card, and the default for every page without one of its own: the day's work in
 * both expressions across the seam (third-physics-phase-d.md §2) with the statement line. It
 * follows the home's five-minute cadence.
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
  const ink = work ? getInterpretation(work, 'ink') : undefined;
  const light = work ? getInterpretation(work, 'light') : undefined;
  if (!work || !ink || !light) notFound();
  const [inkPicture, lightPicture] = await Promise.all([
    expressionPicture(ink, 560),
    expressionPicture(light, 560),
  ]);
  if (!inkPicture || !lightPicture) notFound();
  const indexed = indexedWork(work.id);
  const label = `${workNumber(work.id)} · ${t.ink}`;
  const monogram = indexed
    ? `${t.seedShort} ${indexed.seed.slice(0, 6)}…${indexed.seed.slice(-4)}`
    : undefined;
  return new ImageResponse(
    <PairCard
      leaves={[
        { ground: cardGround(work.id, ink), night: false, picture: inkPicture, label },
        { ground: cardGround(work.id, light), night: true, picture: lightPicture, label: t.light },
      ]}
      words={t.statementLine}
      monogram={monogram}
    />,
    {
      ...size,
      fonts: await cardFonts(locale, `${label} ${t.light} ${t.statementLine} ${monogram ?? ''}`),
    },
  );
}
