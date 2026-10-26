import Link from 'next/link';
import type { CSSProperties } from 'react';
import { indexedAssetUrl, type IndexedWork } from '@/lib/art/collection-index';
import { workFolio, workNumber } from '@/lib/art/number';
import type { Messages } from '@/lib/i18n/en';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import {
  HANG_GAP,
  HANG_HEIGHT,
  HANG_WIDTH,
  layoutSpectrum,
  spectrumPosition,
  spectrumTicks,
} from './spectrum';
import styles from './collection.module.css';

/**
 * The Spectrum wall: every Light preview hung on black along a 380–700 nm rule by its
 * published dominant wavelength, works at the same nanometre stacking, the rule's ticks the
 * only chrome. A real rainbow of the collection from measurements no one else publishes.
 */
export function SpectrumWall({
  measured,
  unmeasured,
  locale,
  t,
}: {
  measured: IndexedWork[];
  unmeasured: IndexedWork[];
  locale: Locale;
  t: Messages;
}) {
  const { groups, height } = layoutSpectrum(measured);
  const href = (work: IndexedWork) => localizedPath(locale, `/art/${work.id}?expression=light`);
  const preview = (work: IndexedWork) =>
    indexedAssetUrl(work, work.media.light?.preview?.path ?? work.media.light?.still?.path);
  return (
    <section className={styles.spectrum} aria-labelledby="spectrum-title" data-spectrum-wall>
      <header className={styles.spectrumHead}>
        <h2 id="spectrum-title" className="small-caps">
          {t.spectrumWall}
        </h2>
        <p className="folio muted">{t.spectrumNote}</p>
      </header>
      <div className={styles.rule} aria-hidden="true">
        {spectrumTicks().map((tick) => (
          <span
            key={tick.nm}
            className={styles.tick}
            data-labelled={tick.labelled || undefined}
            style={{ '--x': `${spectrumPosition(tick.nm) * 100}%` } as CSSProperties}
          >
            {tick.labelled ? <span className={styles.tickLabel}>{tick.nm}</span> : null}
          </span>
        ))}
      </div>
      <ol
        className={styles.wall}
        style={
          {
            '--wall-height': `${height}cqw`,
            '--hang-width': `${HANG_WIDTH}cqw`,
            '--hang-height': `${HANG_HEIGHT}cqw`,
            '--hang-gap': `${HANG_GAP}cqw`,
          } as CSSProperties
        }
      >
        {groups.map((group) => (
          <li
            key={group.nm}
            className={styles.column}
            data-count={group.works.length}
            style={{ '--x': `${group.x}cqw`, '--y': `${group.y}cqw` } as CSSProperties}
          >
            <span className={styles.nm}>{group.nm} nm</span>
            <ul className={styles.stack}>
              {group.works.map((work) => (
                <li key={work.id}>
                  <Link
                    href={href(work)}
                    className={styles.hang}
                    aria-label={`${workNumber(work.id)} · ${t.light} · ${group.nm} nm`}
                    data-work={work.id}
                  >
                    {preview(work) ? (
                      <img
                        src={preview(work)}
                        alt=""
                        width={640}
                        height={414}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className={styles.missing} />
                    )}
                    <span className={styles.hangFolio} aria-hidden="true">
                      {workFolio(work.id)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {unmeasured.length ? (
        <div className={styles.shelf}>
          <h3 className="small-caps">{t.unmeasured}</h3>
          <ul className={styles.shelfRow}>
            {unmeasured.map((work) => (
              <li key={work.id}>
                <Link
                  href={href(work)}
                  className={styles.hang}
                  aria-label={`${workNumber(work.id)} · ${t.light}`}
                >
                  {preview(work) ? (
                    <img
                      src={preview(work)}
                      alt=""
                      width={640}
                      height={414}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className={styles.missing} />
                  )}
                  <span className={styles.hangFolio} aria-hidden="true">
                    {workFolio(work.id)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
