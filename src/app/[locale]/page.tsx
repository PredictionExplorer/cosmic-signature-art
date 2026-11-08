import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { expressionOfTheDay, venueNow, workOfTheDay } from '@/lib/art/work-of-the-day';
import { openingOn } from '@/lib/art/opening';
import { filmOrbit, performedOrbits } from '@/lib/art/orbit-windows';
import { plateFrame } from '@/lib/art/orbit-frames';
import { workOrbit } from '@/lib/art/orbit-records';
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

/**
 * The home answers the eight locales its layout lists (generateStaticParams) and no other, and
 * says so: its parameter is closed, and the router predicts no route with a closed parameter.
 * Otherwise a router that has learned /[locale] from an address carrying its locale (/uk, /en)
 * takes an English address such as /exhibitions, which the proxy rewrites to /en/exhibitions,
 * for the home in a locale named "exhibitions". It asks that address for the home's own
 * segment, a 404, and then for the locale's layout, again and again, about a thousand times a
 * second (tests/e2e/not-found.spec.ts). The home is the only route an English address of one
 * part can be taken for, so the setting is the home's alone.
 */
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  // The day's work's card is drawn beside this route (opengraph-image.tsx), not configured here.
  return metadata(locale, '/', `${t.shape} ${t.ofMotion}`, t.statementLine, null);
}

/**
 * The day's work as First Light performs it (docs/first-light.md §4): its recorded window, its
 * frame on the Light film, its closest approach and its Light still. Without a frame that still
 * binds to the film there is nothing to land on, and the home opens as it always does.
 */
function overtureOf(work: Artwork): OvertureWork | null {
  const [performed] = performedOrbits([work.id]);
  const light = getInterpretation(work, 'light');
  const frame = light ? plateFrame(work.id, light) : undefined;
  const orbit = workOrbit(work.id);
  if (!performed || !light?.rungs?.length || !frame || !orbit) return null;
  return {
    start: performed.window,
    frame,
    closestStep: orbit.published.closestApproach.step,
    rungs: light.rungs,
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
  const firstLight = overtureOf(work);
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
      <Overture work={firstLight} skip={t.firstLightSkip} />
      {/* Screen 3: the statement line, the one screen without a work. */}
      <HomeStatement locale={locale} t={t} firstLight={firstLight ? work.id : undefined} />
      {/* Screen 4: a spread of two plates across the seam, one in each expression. */}
      <HomeSpread locale={locale} t={t} day={expressionOfTheDay(now)} />
      {/* Screen 5: the day's work's cycle as a row of real previews. */}
      <HomeCycle locale={locale} t={t} dayWork={work.id} />
    </main>
  );
}
