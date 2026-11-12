import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { words } from '@/lib/i18n/words';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { expressionOfTheDay, venueNow, workOfTheDay } from '@/lib/art/work-of-the-day';
import { openingOn } from '@/lib/art/opening';
import { filmOrbit } from '@/lib/art/orbit-windows';
import { showWorkOf } from '@/lib/art/first-light-work';
import { homeLine } from '@/lib/art/fate-line';
import { metadata } from '@/lib/site';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { ARTWORK_VIEWER_WORDS } from '@/components/artwork-viewer.words';
import { HomeCycle, HomeSpread, HomeStatement } from '@/components/home-screens';
import { Overture } from '@/components/overture';

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
 * The home opens on the day's work in the day's expression: Screen 1 is that plate with the
 * line under it, which says what a newcomer is looking at, Screen 2 the same orbit in the other
 * expression, one Turn away. Light and Ink take the first screen on alternate days
 * (third-physics-phase-d.md §2). A first visit opens with the Overture, the venue's one timed
 * event: the plate condenses out of its orbit, then lands.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const now = venueNow();
  const work = getCuratedArtwork(workOfTheDay(now))!;
  const firstLight = showWorkOf(work);
  return (
    <main id="main" className="home">
      {/* No headline on the wall: the page's h1 is the statement screen's wordmark below. */}
      <ArtworkViewer
        artwork={work}
        t={words(t, ARTWORK_VIEWER_WORDS)}
        locale={locale}
        presentation="home"
        openingExpression={openingOn(work, undefined, expressionOfTheDay(now))}
        inlinePreviews={{
          ink: inlineCuratedPreview(work.id, 'ink'),
          light: inlineCuratedPreview(work.id, 'light'),
        }}
        orbit={filmOrbit(work.id)}
        lines={{ ink: homeLine(work.id, 'ink', t), light: homeLine(work.id, 'light', t) }}
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
