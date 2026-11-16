import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { fill } from '@/lib/i18n/format';
import { words } from '@/lib/i18n/words';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { workNumber } from '@/lib/art/number';
import { getArtwork } from '@/lib/art/server';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { ESSAY_EXEMPLAR, essayFacts } from '@/lib/essay/facts';
import { ChapterPlate } from './chapter-plate';
import { CHAPTER_PLATE_WORDS, type ChapterPlateWords } from './chapter-plate.words';
import { SweepPlayer } from './sweep-player';
import { SWEEP_PLAYER_WORDS, type SweepPlayerWords } from './sweep-player.words';
import { RoomSeams } from './room-seams';
import { ChapterIndex, EssayChapters, EssayContents, EssaySources, EssayTerms } from './essay';
import styles from './process.module.css';
import { nightViewport } from '@/app/viewport';

/**
 * The day's work turns over at UTC midnight. The essay and the home regenerate every five
 * minutes rather than restructuring the cache around midnight, so both agree on the day's
 * work within that window after the boundary.
 */
export const revalidate = 300;

/** A night route: the browser's chrome is black from the first byte (src/app/viewport.ts). */
export const viewport = nightViewport;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/process', t.processTitle, t.processIntro);
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
 * The essay (docs/process-essay.md). Night holds gravity: the cover, the day's work in Light,
 * six chapters on what three bodies do and how the venue computes it, and the spectrum. Paper
 * holds the water: the same work in Ink, two chapters on what the water does, what is not
 * known, the venue's terms, the sources, and the thesis. One hard seam lies between them.
 */
export default async function Process({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  // Each live part's words, picked once: its fallback and its streamed self are handed the same.
  const plateWords = words(t, CHAPTER_PLATE_WORDS);
  const sweepWords = words(t, SWEEP_PLAYER_WORDS);
  const work = getCuratedArtwork(workOfTheDay())!;
  const indexed = indexedWork(work.id);
  // The essay takes its examples from the day's work. The work its registry was ranged on
  // stands in for one the registries have not measured; every sentence names the work it is of.
  const facts = essayFacts(work.id, locale, t) ?? essayFacts(ESSAY_EXEMPLAR, locale, t);
  if (!facts) throw new Error('The essay has no figures; run `npm run art:essay`');
  const reading = { t, locale, facts };
  return (
    <main id="main" className={`process-page ${styles.page}`}>
      <RoomSeams />
      <section
        className={`${styles.night} ${styles.opening}`}
        data-ground="night"
        aria-labelledby="process-title"
      >
        <div className={styles.eyeline}>
          <p className="eyebrow">{t.process}</p>
        </div>
        <div className={styles.title}>
          <h1 id="process-title" className={styles.cover}>
            {t.processTitle}
          </h1>
          <p className={`reading ${styles.intro}`}>{t.essayStandfirst}</p>
          <p className={styles.byline}>{t.statementSigned}</p>
        </div>
        <EssayContents t={t} />
      </section>

      <section
        id="light"
        className={`${styles.night} ${styles.chapterPlate}`}
        data-ground="night"
        aria-labelledby="light-title"
      >
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="·" word={t.light} />
          <div>
            <h2 id="light-title">{t.gravityTitle}</h2>
            <p>{fill(t.essayLightCopy, { work: workNumber(work.id) })}</p>
          </div>
        </header>
        <Suspense
          fallback={
            <ChapterPlate
              media={getInterpretation(work, 'light')}
              artworkId={work.id}
              t={plateWords}
            />
          }
        >
          <LiveLightChapter work={work} t={plateWords} />
        </Suspense>
      </section>

      <EssayChapters ground="night" {...reading} />

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
            <p>{t.sweepCopy}</p>
          </div>
        </header>
        <Suspense
          fallback={
            <SweepPlayer
              still={getInterpretation(work, 'light')}
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
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="·" word={t.ink} />
          <div>
            <h2 id="ink-title">{t.fluidTitle}</h2>
            <p>{t.essayInkCopy}</p>
          </div>
        </header>
        <ChapterPlate media={getInterpretation(work, 'ink')} artworkId={work.id} t={plateWords} />
      </section>

      <EssayChapters ground="paper" {...reading} />
      <EssayTerms t={t} facts={facts} />
      <EssaySources t={t} />

      <section
        className={`${styles.paper} ${styles.coda}`}
        data-ground="paper"
        aria-labelledby="expression-title"
      >
        <ChapterIndex numeral="·" word={t.ways} />
        <div>
          <h2 id="expression-title" className="chapter">
            {t.expressionTitle}
          </h2>
          <p className={`reading ${styles.codaCopy}`}>{t.expressionCopy}</p>
          <Link className="text-link" href={localizedPath(locale, `/art/${work.id}`)}>
            {t.enterWork} · {workNumber(work.id)}
          </Link>
        </div>
      </section>
    </main>
  );
}
