import Link from 'next/link';
import { useMemo } from 'react';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { Comparison, MeasurementKey } from '@/lib/physics/orbit';
import { derivedValue, measurementLabels, recordValues } from './orbit-proof';
import styles from './orbit-score.module.css';

/**
 * The published record, checked here (orbit-score.tsx): the record's opening, in act two of the
 * work page. Each measurement stands as the record states it and is marked as the derivation in
 * this browser reaches it, with both values where they differ. The summary speaks once every row
 * has been checked, from a slot of its own.
 */
export function OrbitRecord({
  orbit,
  t,
  locale,
  comparisons,
  summary,
  labelledBy,
}: {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
  /** The rows checked so far, or none before the derivation is done. */
  comparisons: Comparison[] | null;
  summary: string | null;
  /** The heading that names the table: the record's opening (orbit-score.tsx). */
  labelledBy: string;
}) {
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const labels = measurementLabels(t);
  const record = recordValues(orbit, t, number);
  return (
    <div className={styles.record}>
      <table className={styles.proof} aria-labelledby={labelledBy}>
        <thead className={styles.visuallyHidden}>
          <tr>
            <th scope="col">{t.orbitMeasurement}</th>
            <th scope="col">{t.orbitValue}</th>
            <th scope="col">{t.orbitCheck}</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(labels) as MeasurementKey[]).map((key) => {
            const row = comparisons?.find((comparison) => comparison.key === key);
            return (
              <tr key={key} data-key={key} data-exact={row ? String(row.exact) : undefined}>
                <th scope="row">{labels[key]}</th>
                <td className={key === 'braidWord' ? styles.word : undefined}>
                  <span>{record[key]}</span>
                  {row && !row.exact ? (
                    <span className={styles.derivedValue}>{derivedValue(row, t)}</span>
                  ) : null}
                </td>
                <td className={styles.check}>
                  {row ? (row.exact ? t.orbitExact : t.orbitDiffers) : t.orbitPending}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.summary} role="status">
        {summary}
      </p>
      <p className={styles.note}>
        {fill(t.orbitNote, {
          index: number.format(orbit.generation.selectedIndex),
          steps: number.format(orbit.generation.warmupSteps + orbit.generation.steps),
        })}
      </p>
      {/* The same derivation, printed whole on a page of its own (Verify an orbit). */}
      <p className={styles.verify}>
        <Link className="word-link" href={localizedPath(locale, `/verify/orbit/${orbit.id}`)}>
          {t.verifyOrbitLineByLine}
        </Link>
      </p>
    </div>
  );
}
