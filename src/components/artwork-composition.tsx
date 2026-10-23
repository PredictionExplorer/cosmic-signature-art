import { getArtworkDetails } from '@/lib/art/server';
import type { Artwork } from '@/lib/art/types';
import type { ArtworkDetails } from '@/lib/art/details-validation';
import type { Messages } from '@/lib/i18n/en';
import type { Locale } from '@/lib/i18n/routing';
import styles from './artwork-record.module.css';

export async function ArtworkComposition({
  work,
  locale,
  t,
}: {
  work: Artwork;
  locale: Locale;
  t: Messages;
}) {
  const result = await getArtworkDetails(work.id, work.seed);
  // Old metadata can legitimately have no rendering traits; never invent replacements.
  if (result.status === 'pending') return null;
  if (!result.details) return <p className="notice">{t.detailsUnavailable}</p>;
  return <ArtworkCompositionView details={result.details} locale={locale} t={t} />;
}

export function ArtworkCompositionView({
  details,
  locale,
  t,
}: {
  details: ArtworkDetails;
  locale: Locale;
  t: Messages;
}) {
  const number = new Intl.NumberFormat(locale);
  const traits = [
    'structure',
    'palette',
    'spectralClass',
    'massBalance',
    'fate',
    'chaos',
    'syzygies',
  ] as const;
  const simulation = ['integrator', 'simulationSteps', 'braidCrossings'] as const;
  const value = (entry: string | number) =>
    typeof entry === 'number' ? number.format(entry) : <bdi>{entry}</bdi>;
  return (
    <section className={styles.composition} aria-labelledby="composition-title">
      <header className={styles.sectionHeading}>
        <h2 id="composition-title">{t.composition}</h2>
        <p>{t.compositionCopy}</p>
      </header>
      <dl className={styles.traits}>
        {traits.map((key) =>
          details[key] !== undefined ? (
            <div key={key}>
              <dt>{t[key]}</dt>
              <dd>
                {value(details[key])}
                {key === 'chaos' ? ' / 100' : ''}
              </dd>
            </div>
          ) : null,
        )}
      </dl>
      {simulation.some((key) => details[key] !== undefined) ? (
        <details className={styles.simulation}>
          <summary>{t.simulation}</summary>
          <dl className={styles.traits}>
            {simulation.map((key) =>
              details[key] !== undefined ? (
                <div key={key}>
                  <dt>{t[key]}</dt>
                  <dd>{value(details[key])}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
