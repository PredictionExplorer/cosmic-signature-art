'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { localizedPath, type Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import { workNumber } from '@/lib/art/number';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { Comparison, MeasurementKey, Progress } from '@/lib/physics/orbit';
import type { OrbitReply, OrbitRequest } from '@/lib/physics/orbit.worker';
import {
  MEASUREMENTS,
  derivedValue,
  measurementLabels,
  orbitWorker,
  progressText,
  recordValues,
  seedShort,
  verdict,
} from './orbit-proof';
import styles from './orbit-verifier.module.css';

/** A line of the transcript after the seed: a phase of the derivation, or the run on to the fate. */
type Line = { kind: 'phase'; progress: Progress; at: number } | { kind: 'fate'; at: number };

interface Transcript {
  lines: Line[];
  /** The window's ten measurements, as the worker compared them with the record. */
  measured: Comparison[] | null;
  /** The fate, checked last; 'failed' when this browser could not run on to it. */
  fate: Comparison | 'failed' | null;
  /** Nothing could be derived here. */
  failed: boolean;
  /** Seconds from the request to the last word. */
  seconds: number | null;
}
const BEGUN: Transcript = { lines: [], measured: null, fate: null, failed: false, seconds: null };

/** True once hydrated: the server and the hydrating render both say false. */
const noSubscription = () => () => {};
const onClient = () => true;
const onServer = () => false;

/** A phase is done once the next begins, so its line settles at its whole count. */
function settled(lines: Line[]): Line[] {
  const last = lines.at(-1);
  if (last?.kind !== 'phase' || last.progress.done === last.progress.total) return lines;
  return [
    ...lines.slice(0, -1),
    { ...last, progress: { ...last.progress, done: last.progress.total } },
  ];
}

/** A report from the worker: the running phase counts on in its own line; a new one starts a line. */
function reported(lines: Line[], progress: Progress, at: number): Line[] {
  const last = lines.at(-1);
  if (last?.kind === 'phase' && last.progress.phase === progress.phase)
    return [...lines.slice(0, -1), { ...last, progress }];
  return [...settled(lines), { kind: 'phase', progress, at }];
}

/**
 * Verify an orbit (third-physics.md §5.12): the work's orbit derived again from its seed in this
 * browser, printed as a transcript while the worker reports. The seed, the candidates read up to
 * the chosen one, its warm-up, the recorded window and the braid's second pass each take a line,
 * stamped with the moment it began here; then every measurement of the published record with
 * its check, the fate last, the time taken and the verdict. Nothing begins before hydration.
 * The lines are not a live region: only the verdict is announced, once every row is checked.
 */
export function OrbitVerifier({
  orbit,
  t,
  locale,
}: {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
}) {
  const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
  const [transcript, setTranscript] = useState<Transcript>(BEGUN);
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  useEffect(() => {
    if (!hydrated || typeof Worker === 'undefined') return;
    const started = performance.now();
    const at = () => (performance.now() - started) / 1000;
    let worker: Worker;
    try {
      worker = orbitWorker();
    } catch {
      queueMicrotask(() => setTranscript((current) => ({ ...current, failed: true })));
      return;
    }
    // Measured or not, a worker that stops leaves the rows it checked and says what it could not.
    const fail = () => {
      const seconds = at();
      setTranscript((current) =>
        current.measured
          ? { ...current, fate: 'failed', seconds }
          : { ...current, failed: true, seconds },
      );
      worker.terminate();
    };
    worker.onmessage = ({ data }: MessageEvent<OrbitReply>) => {
      const seconds = at();
      if (data.type === 'progress')
        setTranscript((current) => ({
          ...current,
          lines: reported(current.lines, data.progress, seconds),
        }));
      else if (data.type === 'done')
        // The window is measured; the worker runs on past it to the fate before it is done.
        setTranscript((current) => ({
          ...current,
          lines: [...settled(current.lines), { kind: 'fate', at: seconds }],
          measured: data.comparisons,
        }));
      else if (data.type === 'fate') {
        setTranscript((current) => ({ ...current, fate: data.comparison, seconds }));
        worker.terminate();
      } else fail();
    };
    worker.onerror = fail;
    const request: OrbitRequest = {
      generation: orbit.generation,
      published: orbit.published,
      // Nothing is drawn here: the window keeps one sample, and no bodies before an escape.
      stride: orbit.generation.steps,
      fate: { published: orbit.fate, lead: 0 },
    };
    worker.postMessage(request);
    return () => {
      worker.terminate();
      // A derivation asked again (the page's data refreshed) prints its transcript afresh.
      setTranscript(BEGUN);
    };
  }, [hydrated, orbit]);

  const phase = !hydrated
    ? 'waiting'
    : typeof Worker === 'undefined' || transcript.failed
      ? 'failed'
      : transcript.fate
        ? 'derived'
        : 'deriving';
  const labels = measurementLabels(t);
  const record = recordValues(orbit, t, number);
  /** A line's moment, in seconds since the derivation was asked for. */
  const stamp = (at: number) => (
    <time className={styles.at} dateTime={`PT${at.toFixed(1)}S`}>
      {fill(t.verifyOrbitAt, { seconds: oneDecimal.format(at) })}
    </time>
  );
  const checked = new Map<MeasurementKey, Comparison>(
    (transcript.measured ?? []).map((row) => [row.key, row]),
  );
  if (transcript.fate && transcript.fate !== 'failed') checked.set('fate', transcript.fate);
  // The record is printed once the window is measured, the fate when it is reached; when nothing
  // could be derived, the whole record stands as published, unchecked.
  const printed =
    phase === 'failed'
      ? MEASUREMENTS
      : transcript.measured
        ? MEASUREMENTS.filter((key) => key !== 'fate' || transcript.fate)
        : [];
  const rows = [...checked.values()];
  const unchecked = printed.length - rows.length;
  const differing = rows.filter((row) => !row.exact).length;
  // The time taken, then the verdict; a row left unchecked is never counted as the record.
  const took =
    phase === 'derived'
      ? fill(t.verifyOrbitTook, { seconds: oneDecimal.format(transcript.seconds ?? 0) })
      : null;
  const said =
    phase === 'failed'
      ? t.orbitUnavailable
      : phase !== 'derived'
        ? null
        : unchecked
          ? [
              differing ? verdict(rows, t) : null,
              fill(t.verifyOrbitSomeUnchecked, { count: unchecked, total: printed.length }),
            ]
              .filter(Boolean)
              .join(' ')
          : verdict(rows, t);
  const ended = phase === 'derived' || phase === 'failed';

  return (
    <section
      className={styles.verifier}
      aria-labelledby="derivation-title"
      aria-busy={phase === 'deriving'}
      data-phase={phase}
      data-exact={phase === 'derived' ? String(!differing && !unchecked) : undefined}
    >
      <h2 id="derivation-title" className={styles.title}>
        {t.verifyOrbitLineByLine}
      </h2>
      {phase === 'waiting' ? (
        <p className={styles.waiting}>{t.verifyOrbitWaiting}</p>
      ) : (
        <ol className={styles.lines}>
          <li>
            {stamp(0)}
            <span>{fill(t.verifyOrbitSeedLine, { seed: seedShort(orbit.generation.seed) })}</span>
          </li>
          {transcript.lines.map((line, index) => (
            <li key={`${line.kind}-${index}`}>
              {stamp(line.at)}
              <span>
                {line.kind === 'phase'
                  ? progressText(line.progress, orbit.generation, t, number)
                  : fill(t.verifyOrbitFateRun, { steps: number.format(orbit.fate.horizonSteps) })}
              </span>
            </li>
          ))}
        </ol>
      )}
      {printed.length ? (
        <div className={styles.record}>
          <h3 className={styles.recordTitle}>{t.orbitTableCaption}</h3>
          <dl className={styles.rows}>
            {printed.map((key) => {
              const row = checked.get(key);
              return (
                <div
                  key={key}
                  className={styles.row}
                  data-key={key}
                  data-exact={row ? String(row.exact) : undefined}
                >
                  <dt className={styles.label}>{labels[key]}</dt>
                  <dd
                    className={
                      key === 'braidWord' ? `${styles.value} ${styles.word}` : styles.value
                    }
                  >
                    {record[key]}
                  </dd>
                  {row && !row.exact ? (
                    <dd className={styles.derived}>{derivedValue(row, t)}</dd>
                  ) : null}
                  <dd className={styles.check}>
                    {row ? (row.exact ? t.orbitExact : t.orbitDiffers) : t.verifyOrbitUnchecked}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : null}
      {/* Announced once, whole: the space keeps the two sentences apart when read as one. */}
      <div className={styles.summary} role="status">
        {took ? (
          <>
            <p className={styles.took}>{took}</p>{' '}
          </>
        ) : null}
        {said ? <p className={styles.verdict}>{said}</p> : null}
      </div>
      {ended ? (
        <div className={styles.words}>
          <Link className="word-link" href={localizedPath(locale, '/verify/orbit')}>
            {t.verifyOrbitAnother}
          </Link>
          <Link className="word-link" href={localizedPath(locale, `/art/${orbit.id}`)}>
            {fill(t.allTheLightVisit, { work: workNumber(orbit.id) })}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
