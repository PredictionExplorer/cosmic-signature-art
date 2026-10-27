import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { messages } from '@/lib/i18n/messages';
import { metadata } from '@/lib/site';
import { indexedWork } from '@/lib/art/collection-index';
import { artworkFromIndex } from '@/lib/art/collection-cards';
import { getInterpretation } from '@/lib/art/types';
import { ArtworkMedia } from '@/components/artwork-media';
import {
  exhibitionIds,
  exhibitionLine,
  exhibitionSummary,
  exhibitionTitle,
  exhibitions,
} from '@/lib/exhibitions/exhibitions';
import styles from './exhibitions.module.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = messages(locale);
  // No image of its own: the venue's card beside the home stands for the list.
  return metadata(locale, '/exhibitions', t.exhibitions, t.exhibitionsIntro, null);
}

/** The exhibitions, as a quiet list: one plate each, the kind and date, the title, one line. */
export default async function Exhibitions({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = messages(locale);
  const items = exhibitions();
  return (
    <main id="main" className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t.exhibitions}</h1>
        <p className={`reading ${styles.intro}`}>{t.exhibitionsIntro}</p>
      </header>
      <ol className={styles.list}>
        {items.map((item) => {
          const first = indexedWork(exhibitionIds(item)[0]);
          const work = first ? artworkFromIndex(first) : undefined;
          const media = work ? (getInterpretation(work, 'ink') ?? work.media[0]) : undefined;
          const title = exhibitionTitle(item, t);
          return (
            <li key={item.slug}>
              <Link
                className={styles.row}
                href={localizedPath(locale, `/exhibitions/${item.slug}`)}
                aria-label={title}
              >
                <span className={styles.rowPlate}>
                  {media ? (
                    <ArtworkMedia media={media} alt="" artworkId={work!.id} still thumbnail />
                  ) : null}
                </span>
                <span className={styles.rowWords}>
                  <span className="eyebrow">{exhibitionLine(item, locale, t)}</span>
                  <span className={styles.rowTitle}>{title}</span>
                  <span className={styles.rowLine}>{exhibitionSummary(item, locale, t)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
