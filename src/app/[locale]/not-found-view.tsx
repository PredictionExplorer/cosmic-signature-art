'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { messages } from '@/lib/i18n/messages';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import type { ArtInterpretation } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import { ArtworkMedia } from '@/components/artwork-media';
import { useRoom } from '@/components/room-ground';
import styles from './not-found.module.css';

/** A page of the same venue: the night ground, a real plate, and the way to the work next door. */
export function NotFoundView({
  neighbour,
  light,
}: {
  neighbour: number;
  light?: ArtInterpretation;
}) {
  const params = useParams();
  const locale =
    typeof params.locale === 'string' && isLocale(params.locale) ? params.locale : 'en';
  const t = messages(locale);
  useRoom('night');
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
        <h1 className={styles.title}>{t.notFound}</h1>
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
