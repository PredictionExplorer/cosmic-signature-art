import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { words } from '@/lib/i18n/words';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { inlineCuratedPreview } from '@/lib/art/inline-preview';
import { expressionOfTheDay, venueNow, workOfTheDay } from '@/lib/art/work-of-the-day';
import { openingOn } from '@/lib/art/opening';
import { filmOrbit } from '@/lib/art/orbit-windows';
import { showWorkOf } from '@/lib/art/first-light-work';
import { homeLine } from '@/lib/art/fate-line';
import { workNumber } from '@/lib/art/number';
import { getArtwork } from '@/lib/art/server';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { ESSAY_EXEMPLAR, essayFacts, paragraph } from '@/lib/essay/facts';
import { metadata } from '@/lib/site';
import { bindFigures, SEPARATOR } from '@/lib/typography';
import { ArtworkViewer } from '@/components/artwork-viewer';
import { ARTWORK_VIEWER_WORDS } from '@/components/artwork-viewer.words';
import { collectionCounts, CycleRow } from '@/components/home-screens';
import { OrbitDepth } from '@/components/orbit-depth';
import { ORBIT_DEPTH_WORDS } from '@/components/orbit-depth.words';
import { Overture } from '@/components/overture';
import { ChapterPlate } from './_essay/chapter-plate';
import { CHAPTER_PLATE_WORDS, type ChapterPlateWords } from './_essay/chapter-plate.words';
import {
  ChapterIndex,
  EssayChapters,
  EssayContents,
  EssaySources,
  EssayTerms,
  PART_NUMERALS,
  Title,
} from './_essay/essay';
import { RoomSeams } from './_essay/room-seams';
import { SweepPlayer } from './_essay/sweep-player';
import { SWEEP_PLAYER_WORDS, type SweepPlayerWords } from './_essay/sweep-player.words';
import styles from './_essay/process.module.css';

/**
 * The day's work follows the UTC date. The home regenerates every minute, as the live record
 * its Light plate and its sweep ask for does (src/lib/art/request.ts), rather than
 * restructuring the cache around midnight: the plate and the essay beneath it agree on the
 * day's work within that window after the boundary.
 */
export const revalidate = 60;

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
  // The description says what the page is: the day's work, set out as it was made.
  return metadata(locale, '/', t.shapeOfMotion, t.homeDescription, null);
}

/** The live record carries the published Light film and the spectral sweep; the registry paints first. */
async function liveWork(work: Artwork): Promise<Artwork> {
  const live = await getArtwork(work.id);
  return live.artwork && live.artwork.seed === work.seed ? live.artwork : work;
}

async function LiveLightChapter({ work, t }: { work: Artwork; t: ChapterPlateWords }) {
  const matching = await liveWork(work);
  return (
    <ChapterPlate
      media={getInterpretation(matching, 'light') ?? getInterpretation(work, 'light')}
      artworkId={work.id}
      t={t}
    />
  );
}

async function LiveSweep({ work, t }: { work: Artwork; t: SweepPlayerWords }) {
  const matching = await liveWork(work);
  const light = getInterpretation(matching, 'light') ?? getInterpretation(work, 'light');
  return (
    <SweepPlayer
      still={light}
      film={light?.films.find((film) => film.id === 'sweep')}
      artworkId={work.id}
      wavelengthNm={indexedWork(work.id)?.wavelengthNm}
      t={t}
    />
  );
}

/**
 * The home: the day's work, then that work taken apart in the order it was made
 * (docs/process-essay.md).
 *
 * The first screen is the day's work in the day's expression: Light and Ink open the venue on
 * alternate days (third-physics-phase-d.md §2), and a first visit opens with the Overture, the
 * venue's one timed event. Beneath it stands the essay, in three numbered parts, each opening
 * with a plate of its own. Night holds the orbit and its Light: the cover, the orbit in depth,
 * which a hand can turn, six chapters on what three bodies do and how the venue computes it,
 * the Light still with its film, two chapters on how the picture is made, and the spectrum.
 * Paper holds the water: the same work in Ink, three chapters on what the water and the sheet
 * do, what is not known, and how a work comes to exist, with its cycle. The venue's terms and
 * the sources close the page, as a book's back matter does.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const now = venueNow();
  const day = getCuratedArtwork(workOfTheDay(now))!;
  // The essay takes its examples from the day's work. The work its registry was ranged on
  // stands in for one the registries have not measured; every sentence names the work it is of.
  const facts = essayFacts(day.id, locale, t) ?? essayFacts(ESSAY_EXEMPLAR, locale, t);
  if (!facts) throw new Error('The essay has no figures; run `npm run art:essay`');
  const work = facts.id === day.id ? day : (getCuratedArtwork(facts.id) ?? day);
  const reading = { t, locale, facts, work };
  const said = (key: Parameters<typeof paragraph>[0][number]) => paragraph([key], facts, t);
  // Each live part's words, picked once: its fallback and its streamed self are handed the same.
  const plateWords = words(t, CHAPTER_PLATE_WORDS);
  const sweepWords = words(t, SWEEP_PLAYER_WORDS);
  const indexed = indexedWork(work.id);
  const firstLight = showWorkOf(day);
  const inDepth = showWorkOf(work);
  const light = getInterpretation(work, 'light');
  return (
    <main id="main" className={`home ${styles.page}`}>
      <RoomSeams />
      {/* No headline on the wall: the page's h1 is the cover's, beneath the plate. */}
      <ArtworkViewer
        artwork={day}
        t={words(t, ARTWORK_VIEWER_WORDS)}
        locale={locale}
        presentation="home"
        wing={false}
        openingExpression={openingOn(day, undefined, expressionOfTheDay(now))}
        inlinePreviews={{
          ink: inlineCuratedPreview(day.id, 'ink'),
          light: inlineCuratedPreview(day.id, 'light'),
        }}
        orbit={filmOrbit(day.id)}
        lines={{ ink: homeLine(day.id, 'ink', t), light: homeLine(day.id, 'light', t) }}
      />
      <Overture work={firstLight} skip={t.firstLightSkip} />

      <section
        className={`${styles.night} ${styles.opening}`}
        data-ground="night"
        aria-labelledby="process-title"
      >
        <div className={styles.eyeline}>
          <p className="eyebrow">{t.livingCollection}</p>
          <p className="counts">{collectionCounts(locale, t).map(bindFigures).join(SEPARATOR)}</p>
        </div>
        <div className={styles.title}>
          <h1 id="process-title" className={styles.cover}>
            {t.processTitle}
          </h1>
          <p className={`reading ${styles.intro}`}>{said('essayStandfirst')}</p>
          <p className={styles.byline}>{t.statementSigned}</p>
        </div>
        <EssayContents t={t} />
      </section>

      <section
        id="orbit"
        className={`${styles.night} ${styles.chapterExhibit}`}
        data-ground="night"
        aria-labelledby="orbit-title"
      >
        {/* One screen: the part's head, the stage, and the strip that says how it is turned. */}
        <div className={styles.exhibitScreen}>
          <header className={`${styles.chapterHead} ${styles.partHead}`}>
            <ChapterIndex numeral={PART_NUMERALS.orbit} word={t.essayOrbitWord} />
            <div>
              <Title id="orbit-title" text={t.gravityTitle} locale={locale} />
              <p>{said('essayOrbitCopy')}</p>
            </div>
          </header>
          <OrbitDepth
            work={inDepth}
            still={light}
            label={workNumber(work.id)}
            name={said('essayDepthLabel')}
            about="orbit-about"
            t={words(t, ORBIT_DEPTH_WORDS)}
          />
        </div>
        {/* What the drawing is. It stands outside the figure so that a phone, which shows the
            stage first, can set the part's head between the stage and this. */}
        <div id="orbit-about" className={styles.exhibitAbout}>
          <p className="small-caps">{t.analysisNotWork}</p>
          <p>{paragraph([{ choose: 'depth' }], facts, t)}</p>
          <p>{t.depthNote}</p>
          {firstLight ? (
            // The whole performance, from the first step to the still: First Light, on a page
            // of its own, for a visitor the Overture was not played to.
            <p>
              <Link className="text-link" href={localizedPath(locale, `/first-light/${day.id}`)}>
                {t.firstLightWatch} →
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <EssayChapters part="orbit" {...reading} />

      <section
        id="light"
        className={`${styles.night} ${styles.chapterPlate}`}
        data-ground="night"
        aria-labelledby="light-title"
      >
        <header className={`${styles.chapterHead} ${styles.partHead}`}>
          <ChapterIndex numeral={PART_NUMERALS.light} word={t.light} />
          <div>
            <Title id="light-title" text={t.essayLightTitle} locale={locale} />
            <p>{said('essayLightCopy')}</p>
          </div>
        </header>
        <Suspense fallback={<ChapterPlate media={light} artworkId={work.id} t={plateWords} />}>
          <LiveLightChapter work={work} t={plateWords} />
        </Suspense>
      </section>

      <EssayChapters part="light" {...reading} />

      <section
        id="spectrum"
        className={`${styles.night} ${styles.chapterPlate}`}
        data-ground="night"
        aria-labelledby="spectrum-title"
      >
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="·" word={t.chapterSpectrum} />
          <div>
            <h2 id="spectrum-title">{t.throughSpectrum}</h2>
            <p>{t.essaySweepCopy}</p>
          </div>
        </header>
        <Suspense
          fallback={
            <SweepPlayer
              still={light}
              artworkId={work.id}
              wavelengthNm={indexed?.wavelengthNm}
              t={sweepWords}
            />
          }
        >
          <LiveSweep work={work} t={sweepWords} />
        </Suspense>
      </section>

      <section
        id="ink"
        className={`${styles.paper} ${styles.chapterPlate}`}
        data-ground="paper"
        aria-labelledby="ink-title"
      >
        <header className={`${styles.chapterHead} ${styles.partHead}`}>
          <ChapterIndex numeral={PART_NUMERALS.ink} word={t.ink} />
          <div>
            <Title id="ink-title" text={t.fluidTitle} locale={locale} />
            <p>{t.essayInkCopy}</p>
          </div>
        </header>
        <ChapterPlate media={getInterpretation(work, 'ink')} artworkId={work.id} t={plateWords} />
      </section>

      <EssayChapters part="ink" {...reading} />
      <EssayChapters part="close" {...reading} />

      <section
        id="cycle"
        className={`${styles.paper} ${styles.coda}`}
        data-ground="paper"
        aria-labelledby="cycle-title"
      >
        <ChapterIndex numeral="·" word={t.essayBornWord} />
        <div>
          <h2 id="cycle-title" className="chapter">
            {t.essayBornTitle}
          </h2>
          <div className={styles.codaCopy}>
            <p className="reading">{t.essayBorn1}</p>
            <p className="reading">{said('essayBorn2')}</p>
          </div>
          <Link className="text-link" href={localizedPath(locale, `/art/${work.id}`)}>
            {t.enterWork} · {workNumber(work.id)}
          </Link>
        </div>
      </section>
      {indexed?.cycle === undefined ? null : (
        <CycleRow locale={locale} t={t} cycle={indexed.cycle} id="home-cycle" ground="paper" />
      )}

      {/* The back matter, after the close: the venue's terms, then the sources. */}
      <EssayTerms {...reading} />
      <EssaySources t={t} locale={locale} />
    </main>
  );
}
