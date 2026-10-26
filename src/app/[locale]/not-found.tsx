'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { messages } from '@/lib/i18n/messages';
import { isLocale, localizedPath } from '@/lib/i18n/routing';
import { fill } from '@/lib/i18n/format';
import { getCuratedArtwork } from '@/lib/art/catalog';
import { getInterpretation } from '@/lib/art/types';
import { workNumber } from '@/lib/art/number';
import { ArtworkMedia } from '@/components/artwork-media';
import { useRoom } from '@/components/room-ground';
import styles from './not-found.module.css';

/** The work next door: a curated Light still that is always held locally. */
const NEIGHBOUR = 31;

/** A page of the same venue: the night ground, a real plate, and the way to the work next door. */
export default function NotFound() {
  const params = useParams();
  const locale =
    typeof params.locale === 'string' && isLocale(params.locale) ? params.locale : 'en';
  const t = messages(locale);
  useRoom('night');
  const neighbour = getCuratedArtwork(NEIGHBOUR)!;
  const light = getInterpretation(neighbour, 'light');
  return (
    <main id="main" className={styles.page}>
      <Link
        className={`plate ${styles.plate}`}
        href={localizedPath(locale, `/art/${NEIGHBOUR}`)}
        aria-label={`${workNumber(NEIGHBOUR)} · ${t.light}`}
      >
        <ArtworkMedia
          media={light}
          alt={`${workNumber(NEIGHBOUR)} · ${t.light}`}
          artworkId={NEIGHBOUR}
          still
          eager
        />
      </Link>
      <div className={`strip ${styles.strip}`}>
        <span className={`numeral ${styles.code}`}>404</span>
        <h1 className={styles.title}>{t.notFound}</h1>
        <div className="strip-words">
          <Link href={localizedPath(locale, `/art/${NEIGHBOUR}`)}>
            {fill(t.nextDoor, { work: workNumber(NEIGHBOUR) })}
          </Link>
          <Link href={localizedPath(locale, '/collection')}>{t.collection}</Link>
        </div>
      </div>
    </main>
  );
}
