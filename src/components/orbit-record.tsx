import Link from 'next/link';
import { useMemo } from 'react';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { Comparison, EnergyKept, MeasurementKey } from '@/lib/physics/orbit';
import { derivedValue, energyText, measurementLabels, recordValues } from './orbit-proof';
import recordStyles from './artwork-record.module.css';
import styles from './orbit-score.module.css';

/** What the record is checked against, and how far the check has got. */
interface Checked {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
  /** The rows checked so far, or none before the derivation is done. */
  comparisons: Comparison[] | null;
  summary: string | null;
  /** What the energy watch found on the run to the fate, once it is there. */
  energy: EnergyKept | null;
}

/**
 * Act two of the work page, the record: the published record, checked here, opens it on paper
 * (docs/first-light.md §17). Its heading names the table beneath it.
 */
export function OrbitProofAct({
  exact,
  ...record
}: Checked & {
  /** Whether every row is the record's, once every row has been checked; null until then. */
  exact: boolean | null;
}) {
  return (
    <section
      id="proof"
      className={styles.proofAct}
      aria-labelledby="orbit-proof-title"
      data-exact={exact === null ? undefined : String(exact)}
    >
      <div className={styles.proofBody}>
        <h2 id="orbit-proof-title" className={`${recordStyles.sectionTitle} ${styles.proofTitle}`}>
          {record.t.orbitTableCaption}
        </h2>
        <OrbitRecord {...record} labelledBy="orbit-proof-title" />
      </div>
    </section>
  );
}

/**
 * The published record, checked here (orbit-score.tsx): the record's opening, in act two of the
 * work page. Each measurement stands as the record states it and is marked as the derivation in
 * this browser reaches it, with both values where they differ. The summary speaks once every row
 * has been checked, from a slot of its own. Beneath the record's note stands what the record does
 * not publish and this browser found: whether the computation kept its energy.
 */
export function OrbitRecord({
  orbit,
  t,
  locale,
  comparisons,
  summary,
  energy,
  labelledBy,
}: Checked & {
  /** The heading that names the table: the record's opening. */
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
      {/* Its room is kept, like the summary's: the watch answers with the fate. */}
      <p
        className={styles.kept}
        data-energy={energy ? (energy.broken ? 'broken' : 'held') : undefined}
      >
        {energy ? energyText(energy, orbit.generation.steps, t, number) : null}
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
