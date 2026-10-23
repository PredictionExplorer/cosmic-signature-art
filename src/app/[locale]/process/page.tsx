import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import type { Messages } from '@/lib/i18n/en';
import { metadata } from '@/lib/site';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getArtwork } from '@/lib/art/server';
import { getInterpretation } from '@/lib/art/types';
import { ArtworkMedia } from '@/components/artwork-media';
import styles from './process.module.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  return metadata(locale, '/process', t.processTitle, t.processIntro);
}

const work = getCuratedArtwork(31)!;

async function LightFilm({ t }: { t: Messages }) {
  const live = await getArtwork(work.id);
  const matchingWork = live.artwork && live.artwork.seed === work.seed ? live.artwork : work;
  const media = getInterpretation(matchingWork, 'light') ?? getInterpretation(work, 'light');
  return (
    <ArtworkMedia media={media} alt={`${t.signature} ${work.id} · ${t.light}`} repeat startAt={6} />
  );
}

export default async function Process({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  return (
    <main id="main" className={`process-page ${styles.page}`}>
      <section className={styles.night} aria-labelledby="process-title">
        <div className={styles.introduction}>
          <div className={styles.eyeline}>
            <p className="eyebrow">{t.process}</p>
            <nav aria-label={t.ways} className={styles.chapterNavigation}>
              <a href="#light">01 / {t.light}</a>
              <span aria-hidden="true">—</span>
              <a href="#ink">
                02 / {t.ink}
                <ArrowDown size={12} />
              </a>
            </nav>
          </div>
          <div className={styles.opening}>
            <h1 id="process-title">{t.processTitle}</h1>
            <p>{t.processIntro}</p>
          </div>
        </div>
        <div id="light" className={styles.lightChapter}>
          <div className={styles.chapterCopy}>
            <p className={styles.chapterIndex}>
              <span>01</span>
              <span className="eyebrow">{t.light}</span>
            </p>
            <h2>{t.gravityTitle}</h2>
            <p className={styles.bodyCopy}>{t.gravityCopy}</p>
            <a href="#ink" className={styles.chapterLink}>
              <span>02 / {t.ink}</span>
              <ArrowDown size={16} />
            </a>
          </div>
          <figure className={styles.lightWork}>
            <Suspense
              fallback={
                <ArtworkMedia
                  media={getInterpretation(work, 'light')}
                  alt={`${t.signature} ${work.id} · ${t.light}`}
                  still
                />
              }
            >
              <LightFilm t={t} />
            </Suspense>
            <figcaption>
              <span>
                {t.signature} {String(work.id).padStart(3, '0')}
              </span>
              <span>{t.light}</span>
            </figcaption>
          </figure>
        </div>
        <div className={styles.materialSeam} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <section id="ink" className={styles.paper} aria-labelledby="ink-title">
        <div className={styles.inkOpening}>
          <p className={styles.chapterIndex}>
            <span>02</span>
            <span className="eyebrow">{t.ink}</span>
          </p>
          <h2 id="ink-title">{t.fluidTitle}</h2>
          <p className={styles.bodyCopy}>{t.fluidCopy}</p>
        </div>
        <figure className={styles.inkWork}>
          <ArtworkMedia
            media={getInterpretation(work, 'ink')}
            alt={`${t.signature} ${work.id} · ${t.ink}`}
            repeat
            startAt={6}
          />
          <figcaption>
            <span>
              {t.signature} {String(work.id).padStart(3, '0')}
            </span>
            <span>
              {t.ink} / {t.film}
            </span>
          </figcaption>
        </figure>
        <div className={styles.colophon}>
          <p className="eyebrow">{t.oneMotion}</p>
          <p>{t.processNote}</p>
        </div>
      </section>
      <section className={styles.coda} aria-labelledby="expression-title">
        <div className={styles.codaNumber} aria-hidden="true">
          ∴
        </div>
        <div>
          <p className="eyebrow">{t.ways}</p>
          <h2 id="expression-title">{t.expressionTitle}</h2>
        </div>
        <div className={styles.codaCopy}>
          <p>{t.expressionCopy}</p>
          <Link className="text-link" href={localizedPath(locale, `/art/${work.id}`)}>
            {t.enterWork}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </main>
  );
}
