import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { indexedWork } from '@/lib/art/collection-index';
import { workOfTheDay } from '@/lib/art/work-of-the-day';
import { workNumber } from '@/lib/art/number';
import { getArtwork } from '@/lib/art/server';
import { getInterpretation, type Artwork } from '@/lib/art/types';
import { ChapterPlate } from './chapter-plate';
import { SweepPlayer } from './sweep-player';
import { RoomSeams } from './room-seams';
import styles from './process.module.css';

/** The day's work turns over at UTC midnight; the essay follows it within the hour. */
export const revalidate = 3600;

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

async function LiveLightChapter({ work, t }: { work: Artwork; t: Messages }) {
  const matching = await liveWork(work);
  return (
    <ChapterPlate
      media={getInterpretation(matching, 'light') ?? getInterpretation(work, 'light')}
      artworkId={work.id}
      t={t}
    />
  );
}

async function LiveSweep({ work, t }: { work: Artwork; t: Messages }) {
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

const CHAPTERS = [
  ['00', 'choice', 'chapterChoice'],
  ['01', 'light', 'light'],
  ['02', 'ink', 'ink'],
  ['03', 'spectrum', 'chapterSpectrum'],
] as const;

export default async function Process({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const work = getCuratedArtwork(workOfTheDay())!;
  const indexed = indexedWork(work.id);
  const number = new Intl.NumberFormat(locale);
  const decimals = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const borda = indexed?.borda;
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
          <nav aria-label={t.ways} className={styles.chapterNav}>
            {CHAPTERS.map(([numeral, id, label]) => (
              <a key={id} href={`#${id}`}>
                <span className="numeral">{numeral}</span>
                <span>{t[label]}</span>
              </a>
            ))}
          </nav>
        </div>
        <div className={styles.title}>
          <h1 id="process-title" className={styles.cover}>
            {t.processTitle}
          </h1>
          <p className={`reading ${styles.intro}`}>{t.processIntro}</p>
          <p className={styles.byline}>{t.statementSigned}</p>
        </div>
      </section>

      <section
        id="choice"
        className={`${styles.night} ${styles.chapterType}`}
        data-ground="night"
        aria-labelledby="choice-title"
      >
        <ChapterIndex numeral="00" word={t.chapterChoice} />
        <div>
          <h2 id="choice-title" className="chapter">
            {t.chapterChoiceCopy}
          </h2>
          {borda ? (
            <>
              <p className={styles.selection}>
                {fill(t.selectionLine, {
                  total: number.format(borda.totalCandidates),
                  index: number.format(borda.selectedIndex),
                })}
              </p>
              <p className={styles.borda}>
                {workNumber(work.id)} ·{' '}
                {fill(t.bordaNote, {
                  chaos: decimals.format(borda.chaosWeight ?? 0),
                  equilibrium: decimals.format(borda.equilibriumWeight ?? 0),
                  aesthetic: decimals.format(borda.aestheticScore ?? 0),
                  score: decimals.format(borda.selectionScore ?? 0),
                })}
              </p>
            </>
          ) : null}
        </div>
        <p className={`reading ${styles.chapterCopy}`}>{t.glossaryBorda}</p>
      </section>

      <section
        id="light"
        className={`${styles.night} ${styles.chapterPlate}`}
        data-ground="night"
        aria-labelledby="light-title"
      >
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="01" word={t.light} />
          <div>
            <h2 id="light-title">{t.gravityTitle}</h2>
            <p>{t.gravityCopy}</p>
          </div>
        </header>
        <Suspense
          fallback={
            <ChapterPlate media={getInterpretation(work, 'light')} artworkId={work.id} t={t} />
          }
        >
          <LiveLightChapter work={work} t={t} />
        </Suspense>
      </section>

      <section
        id="ink"
        className={`${styles.paper} ${styles.chapterPlate}`}
        data-ground="paper"
        aria-labelledby="ink-title"
      >
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="02" word={t.ink} />
          <div>
            <h2 id="ink-title">{t.fluidTitle}</h2>
            <p>{t.fluidCopy}</p>
            <p className={`folio ${styles.note}`}>{t.processNote}</p>
          </div>
        </header>
        <ChapterPlate media={getInterpretation(work, 'ink')} artworkId={work.id} t={t} />
      </section>

      <section
        id="spectrum"
        className={`${styles.night} ${styles.chapterPlate}`}
        data-ground="night"
        aria-labelledby="spectrum-title"
      >
        <header className={styles.chapterHead}>
          <ChapterIndex numeral="03" word={t.chapterSpectrum} />
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
              t={t}
            />
          }
        >
          <LiveSweep work={work} t={t} />
        </Suspense>
      </section>

      <section
        className={`${styles.paper} ${styles.coda}`}
        data-ground="paper"
        aria-labelledby="expression-title"
      >
        <ChapterIndex numeral="∴" word={t.ways} />
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

function ChapterIndex({ numeral, word }: { numeral: string; word: string }) {
  return (
    <p className={styles.chapterIndex}>
      <span className="numeral">{numeral}</span>
      <span className="small-caps">{word}</span>
    </p>
  );
}
