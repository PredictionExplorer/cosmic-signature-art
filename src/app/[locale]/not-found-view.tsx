'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { messages } from '@/lib/i18n/messages';
import { isLocale, localizedPath, type Locale } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import type { ArtInterpretation } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import { ArtworkMedia } from '@/components/artwork-media';
import { useRoom } from '@/components/room-ground';
import styles from './not-found.module.css';

/**
 * A page of the same venue: the night ground, a real plate, and the way to the work next door.
 * Its language is the route's, unless the page is the one no route answered, which has no route
 * and names its locale. It says what is true of the address: a number the collection does not
 * hold has not been imprinted, a work it cannot name is not here, and any other page is not here.
 */
export function NotFoundView({
  neighbour,
  light,
  locale: named,
  asked,
  page = false,
}: {
  neighbour: number;
  light?: ArtInterpretation;
  locale?: Locale;
  /** The number the address asked for, where it named one. */
  asked?: number;
  /** The address names no work: a page, not a work, is missing. */
  page?: boolean;
}) {
  const params = useParams();
  const locale =
    named ?? (typeof params?.locale === 'string' && isLocale(params.locale) ? params.locale : 'en');
  const t = messages(locale);
  useRoom('night');
  const title =
    asked !== undefined && asked !== neighbour
      ? fill(t.notImprinted, { work: workNumber(asked) })
      : page
        ? t.pageNotFound
        : t.notFound;
  return (
    <main id="main" className={styles.page}>
      <Link
        className={`plate ${styles.plate}`}
        href={localizedPath(locale, `/art/${neighbour}`)}
        aria-label={`${workNumber(neighbour)} · ${t.light}`}
      >
        <ArtworkMedia
          media={light}
          alt={`${workNumber(neighbour)} · ${t.light}`}
          artworkId={neighbour}
          still
          eager
        />
      </Link>
      <div className={`strip ${styles.strip}`}>
        <span className={`numeral ${styles.code}`}>404</span>
        <h1 className={styles.title}>{title}</h1>
        <div className="strip-words">
          <Link href={localizedPath(locale, `/art/${neighbour}`)}>
            {fill(t.nextDoor, { work: workNumber(neighbour) })}
          </Link>
          <Link href={localizedPath(locale, '/collection')}>{t.collection}</Link>
        </div>
      </div>
    </main>
  );
}
