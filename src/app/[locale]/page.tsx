import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { expressionOfTheDay, venueNow, workOfTheDay } from '@/lib/art/work-of-the-day';
import { openingOn } from '@/lib/art/opening';
import { filmOrbit, performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { metadata } from '@/lib/site';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { HomeCycle, HomeSpread, HomeStatement } from '@/components/home-screens';
import { Overture, type OvertureWork } from '@/components/overture';

/**
 * The day's work follows the UTC date. Both the home and the process regenerate every five
 * minutes rather than restructuring the cache around midnight, so the two agree on the day's
 * work within that window after the boundary.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  // The day's work's card is drawn beside this route (opengraph-image.tsx), not configured here.
  return metadata(locale, '/', `${t.shape} ${t.ofMotion}`, t.statementLine, null);
}

/**
 * The day's work as the Overture performs it: its recorded window, its Light and order, and
 * where the window falls on the Light film, so the bodies draw the plate itself.
 */
function overtureOf(work: Artwork): OvertureWork | null {
  const [performed] = performedOrbits([work.id]);
  const light = getInterpretation(work, 'light');
  if (!performed || !light?.rungs?.length || !light.arrival) return null;
  return {
    window: performed.window,
    bodyHues: performed.bodyHues,
    rungs: light.rungs,
    arrival: light.arrival.src,
    frame: plateFrame(work.id, light) ?? null,
  };
}

/**
 * The home opens on the day's work in the day's expression: Screen 1 is that plate with the
 * one line, Screen 2 the same orbit in the other expression, one Turn away. Light and Ink take
 * the first screen on alternate days (third-physics-phase-d.md §2). A first visit opens with
 * the Overture, the venue's one timed event: the plate condenses out of its orbit, then lands.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const now = venueNow();
  const work = getCuratedArtwork(workOfTheDay(now))!;
  return (
    <main id="main" className="home">
      {/* No headline on the wall: the page's h1 is the statement screen's wordmark below. */}
      <ArtworkViewer
        artwork={work}
        t={t}
        locale={locale}
        presentation="home"
        openingExpression={openingOn(work, undefined, expressionOfTheDay(now))}
        inlinePreviews={{
          ink: inlineCuratedPreview(work.id, 'ink'),
          light: inlineCuratedPreview(work.id, 'light'),
        }}
        orbit={filmOrbit(work.id)}
      />
      <Overture work={overtureOf(work)} />
      {/* Screen 3: the statement line, the one screen without a work. */}
      <HomeStatement locale={locale} t={t} />
      {/* Screen 4: a spread of two plates across the seam, one in each expression. */}
      <HomeSpread locale={locale} t={t} day={expressionOfTheDay(now)} />
      {/* Screen 5: the day's work's cycle as a row of real previews. */}
      <HomeCycle locale={locale} t={t} dayWork={work.id} />
    </main>
  );
}
