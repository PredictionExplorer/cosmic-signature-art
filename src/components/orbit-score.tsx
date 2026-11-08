'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { clock, fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import type { Continuation } from '@/lib/physics/continuation';
import type { DerivedFate } from '@/lib/physics/orbit';
import { pairName } from '@/lib/physics/film-score';
import { lightFilmDuration, lightFilmSeconds, stepsDrawnAt } from '@/lib/physics/light-film';
import { principalPlane, type Plane } from '@/lib/physics/plane';
import { AFTER_THE_FRAME_EVENT } from '@/lib/venue-events';
import { useMotion } from './motion-provider';
import { drawScore } from './score-drawing';
import { useRememberedExpression, type Expression } from './turn';
import { planePicture, platePicture, type Material } from './orbit-picture';
import { orbitPainter } from './orbit-painter';
import { beyondLine, performBeyond, type Beyond } from './orbit-beyond';
import { STRIDE, useOrbitDerivation, type Derivation } from './orbit-derivation';
import { useOrbitPresence } from './orbit-presence';
import { OrbitRecord } from './orbit-record';
import { progressText, seedShort, verdict } from './orbit-proof';
import styles from './orbit-score.module.css';

/** The plate's still is laid out at the figure's width: the full width on a phone. */
const STILL_SIZES = '(max-width: 860px) 100vw, 62vw';

type State = { phase: 'waiting' } | Derivation;

/**
 * The orbit, re-performed: the work's orbit derived from its seed in this browser, drawn at
 * the Light film's pace, and every published measurement checked against the derivation. The
 * films and stills are recorded renderings; this is the physics beneath them. It lends the
 * running head the night while it stands beneath the head.
 *
 * On the plate (third-physics-phase-d.md §7): with the work's frame, the drawing lies over the
 * still of the expression the page shows, untouched, and each body is drawn where the films put
 * it. On Light the trails add their light to the still's and each body comes to stand where its
 * ribbon ends; on Ink each body, at the size the Ink edition gave it, comes to rest in the hollow
 * it left in the ink. Without a frame, or on an Ink still that does not bear the bodies out, the
 * orbit is drawn as Phase A drew it, in the plane of its greatest extent.
 *
 * After the frame (third-physics.md §5.6): the same physics runs on past the recorded window,
 * at the film's pace, with the window dimmed behind it (orbit-beyond.ts).
 *
 * The section is assembled from its parts: where it stands to the visitor (orbit-presence.ts),
 * the derivation (orbit-derivation.ts), the drawing (orbit-painter.ts) and the record
 * (orbit-record.tsx). This component holds the performance's clock and says what is happening.
 */
export function OrbitScore({
  orbit,
  t,
  locale,
  plate,
  opening,
  both = false,
}: {
  orbit: WorkOrbit;
  t: Messages;
  locale: Locale;
  /** The frame and the stills it lies over (src/lib/art/orbit-plate.ts); none draws in the plane. */
  plate?: OrbitPlate;
  /** The expression the page's plate opened on (src/lib/art/opening.ts). */
  opening?: Expression;
  /** The work publishes both expressions, so the visitor's remembered choice turns its plate. */
  both?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const trails = useRef<HTMLCanvasElement>(null);
  const continued = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  const events = useRef<HTMLCanvasElement>(null);
  const { near, inView, bringNear } = useOrbitPresence(section);
  const [readout, setReadout] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);
  const [beyond, setBeyond] = useState<Beyond | null>(null);
  /** The plate's word asked for After the frame before the fate was known. */
  const [asked, setAsked] = useState(false);
  /** How far past the frame the performance has reached, and whether it has come to rest. */
  const [reached, setReached] = useState(0);
  const [rested, setRested] = useState(false);
  const { paused, reducedMotion, theatre } = useMotion();
  const still = paused || reducedMotion || theatre === 'hushed';
  const steps = orbit.generation.steps;
  const film = lightFilmDuration(steps);
  /** The film's pace: steps of the window per second of the Light film. */
  const pace = steps / film;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  const { derivation, framed, fate } = useOrbitDerivation({
    orbit,
    near,
    pace,
    frame: plate?.frame,
    // The plate's word asked before the fate was known: go on past the frame now it is.
    onFate: () => {
      if (asked) goBeyond('end');
    },
  });
  // Nothing is derived before the section is near, which is never on the server.
  const state: State = !near
    ? { phase: 'waiting' }
    : typeof Worker === 'undefined'
      ? { phase: 'failed' }
      : derivation;
  const finished = still || done;

  const result = state.phase === 'derived' ? state.result : null;
  const derivedFate = fate.phase === 'derived' ? fate.fate : null;
  const plane = useMemo<Plane | null>(
    () => (result ? principalPlane(result.samples.positions, result.samples.count) : null),
    [result],
  );

  // The plate shows the expression the page's plate shows: the visitor's choice, remembered for
  // the visit, else the page's opening; and its still lies beneath only where the frame is borne
  // out for that expression. A window that could not be placed is drawn in its plane.
  const remembered = useRememberedExpression();
  const onPage = (both && remembered) || opening;
  const material: Material | null = onPage && plate?.stills[onPage] ? onPage : null;
  const plateStill =
    material && framed !== null && state.phase !== 'failed' ? plate!.stills[material]! : null;
  const placed = plateStill && framed ? framed : null;

  const goBeyond = (from: Beyond['from']) => {
    setAsked(false);
    setRested(false);
    setReached(from === 'approach' && derivedFate?.approach ? derivedFate.approach.taken : steps);
    setReadout(null);
    setBeyond((current) => ({ from, run: (current?.run ?? 0) + 1 }));
  };
  // The plate's word: bring the section into view and go on past the frame as soon as the fate
  // is known. Asking derives the orbit if the visitor has not come near it yet.
  const onAsk = useEffectEvent(() => {
    bringNear();
    section.current?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    // The word was a link to here: the keyboard and the screen reader come here too.
    section.current?.focus({ preventScroll: true });
    if (beyond) return;
    if (derivation.phase === 'derived' && fate.phase === 'derived') goBeyond('end');
    else setAsked(true);
  });
  useEffect(() => {
    const ask = () => onAsk();
    window.addEventListener(AFTER_THE_FRAME_EVENT, ask);
    return () => window.removeEventListener(AFTER_THE_FRAME_EVENT, ask);
  }, []);

  /** Past the frame, the line says how far the orbit has run, and the words follow it. */
  const speakBeyond = (of: DerivedFate) => (at: Continuation) => {
    setReached(at.taken);
    setRested(at.resting);
    setReadout(beyondLine(of, at, steps, pace, t, number));
  };

  // The drawing: trails accumulate, the bodies ride on a layer above, and the score beneath
  // carries the three separations with the published events. On the plate the drawing lies over
  // the still, in its material: light added on night, graphite and sumi on paper. At the film's
  // pace when motion is welcome and the section is in view; all at once otherwise.
  const drawn = useRef(0);
  const frame = useRef(0);
  /** The orbit past the frame as it stands, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; continuation: Continuation } | null>(null);
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
    const canvases = [trails.current, continued.current, marks.current, events.current];
    // A plate waits for the window's places on it; the plane for its own.
    const ready = plateStill ? !!placed : !!plane;
    if (!result || !ready || canvases.some((canvas) => !canvas)) return;
    const [trailCanvas, continuedCanvas, markCanvas, eventCanvas] = canvases as HTMLCanvasElement[];
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    for (const canvas of canvases as HTMLCanvasElement[]) {
      const box = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
    }
    const trail = trailCanvas.getContext('2d');
    const beyondTrail = continuedCanvas.getContext('2d');
    const mark = markCanvas.getContext('2d');
    const score = eventCanvas.getContext('2d');
    if (!trail || !beyondTrail || !mark || !score) return;
    const { count } = result.samples;
    const width = trailCanvas.width;
    const height = trailCanvas.height;
    const picture =
      placed && material && plate
        ? platePicture(placed, plate.frame, material, width, height, ratio)
        : planePicture(plane!, count, width, height, ratio);
    /** On the plate the bodies stand where the work left them once the window is drawn. */
    const rests = picture.kind === 'plate';
    const hues = orbit.bodyHues;
    const painter = orbitPainter({
      trail,
      mark,
      picture,
      width,
      height,
      ratio,
      hues,
      masses: result.masses,
      closestApproach: result.closestApproach,
      steps,
      stride: STRIDE,
    });

    // The score: log separations of the three pairs, the closest approach, the syzygies and
    // the braid crossings as ticks, and the playhead.
    const scoreWidth = eventCanvas.width;
    const scoreHeight = eventCanvas.height;
    const at = (step: number) => (step / (steps - 1)) * scoreWidth;
    const lane = scoreHeight - 12 * ratio;
    const scoreStill = document.createElement('canvas');
    scoreStill.width = scoreWidth;
    scoreStill.height = scoreHeight;
    const base = scoreStill.getContext('2d');
    if (!base) return;
    drawScore(
      base,
      {
        separations: result.samples.separations,
        count,
        stride: STRIDE,
        closestApproach: result.closestApproach,
        syzygies: result.syzygies,
        crossings: result.braid.events.map((crossing) => crossing.step),
      },
      hues,
      {
        ratio,
        x: at,
        lane: { top: 2 * ratio, height: lane - 4 * ratio },
        base: scoreHeight,
        ticks: { crossing: 3, syzygy: 7, closest: 11 },
        lineAlpha: 0.55,
        ink: 'rgb(241 235 223)',
        every: 2,
      },
    );
    /** The score with its playhead, or dimmed without one while the orbit runs past it. */
    const scoreAt = (step: number | null) => {
      score.clearRect(0, 0, scoreWidth, scoreHeight);
      score.globalAlpha = step === null ? 0.35 : 1;
      score.drawImage(scoreStill, 0, 0);
      score.globalAlpha = 1;
      if (step === null) return;
      score.fillStyle = 'rgb(241 235 223 / 0.92)';
      score.fillRect(Math.round(at(step)), 0, ratio, lane);
    };

    trail.clearRect(0, 0, width, height);
    beyondTrail.clearRect(0, 0, width, height);
    if (beyond && derivedFate)
      return performBeyond({
        fate: derivedFate,
        from: beyond.from,
        key: `${beyond.run}:${beyond.from}`,
        picture,
        plate,
        plane,
        result,
        dt: orbit.generation.dt,
        steps,
        pace,
        still,
        inView,
        beyondTrail,
        mark,
        width,
        height,
        ratio,
        hues,
        painter,
        scoreAt,
        live,
        frame,
        speak: speakBeyond(derivedFate),
        onRested: () => setRested(true),
      });
    // Asked for After the frame, the window waits whole for the fate rather than starting over.
    const whole = still || asked;
    if (whole || !inView) {
      // A window drawn to its end on the plate goes on to the still's step, and its bodies
      // stand where the work left them; in the plane they leave the drawing, as Phase A had it.
      const reached = whole ? count - 1 : drawn.current;
      const ended = reached >= count - 1;
      const last = ended ? picture.last : reached;
      if (last > 0) painter.strokes(0, last);
      painter.bodies(last, ended ? rests : true);
      scoreAt(Math.min(steps - 1, last * STRIDE));
      if (whole) drawn.current = count - 1;
      return;
    }
    if (drawn.current > 0) painter.strokes(0, drawn.current);
    const resumeAt = lightFilmSeconds(drawn.current * STRIDE, steps);
    const begun = performance.now() - resumeAt * 1000;
    let spoken = 0;
    const tickFrame = (now: number) => {
      const seconds = Math.min(film, (now - begun) / 1000);
      const step = stepsDrawnAt(seconds, steps);
      const sample = Math.min(count - 1, Math.floor(step / STRIDE));
      if (sample > drawn.current) {
        painter.strokes(drawn.current, sample);
        drawn.current = sample;
      }
      const complete = sample >= count - 1;
      if (complete && rests) {
        painter.strokes(count - 1, picture.last);
        painter.bodies(picture.last, true);
      } else painter.bodies(sample, !complete);
      scoreAt(step);
      if (now - spoken > 250 || complete) {
        spoken = now;
        const closest = result.closestApproach;
        const nearClosest = step >= closest.step && step - closest.step < 2 * 60 * (steps / 1800);
        setReadout(
          complete
            ? null
            : nearClosest
              ? fill(t.orbitClosestNow, {
                  distance: oneDecimal.format(closest.distance),
                  pair: pairName(closest.pair),
                })
              : fill(t.orbitPlaying, {
                  step: number.format(step),
                  total: number.format(steps),
                  clock: clock(seconds),
                }),
        );
      }
      if (complete) {
        setDone(true);
        return;
      }
      frame.current = requestAnimationFrame(tickFrame);
    };
    frame.current = requestAnimationFrame(tickFrame);
    return () => cancelAnimationFrame(frame.current);
  });

  useEffect(
    () => draw(),
    [result, plane, framed, material, still, inView, run, beyond, derivedFate, asked],
  );

  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      draw();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /** Again: the window from its first step, or After the frame from where it began. */
  const again = () => {
    setReadout(null);
    if (beyond) {
      goBeyond(beyond.from);
      return;
    }
    drawn.current = 0;
    setDone(false);
    setRun((value) => value + 1);
  };
  /** Back to the frame: the recorded window, drawn whole. */
  const leaveBeyond = () => {
    live.current = null;
    drawn.current = Math.max(0, (result?.samples.count ?? 1) - 1);
    setBeyond(null);
    setRested(false);
    setReadout(null);
    setDone(true);
  };

  const published = orbit.published;
  const closest = published.closestApproach;
  // The caption says where the bodies are drawn, and, on the plate, that this is analysis.
  const caption = plateStill
    ? material === 'ink'
      ? t.orbitCaptionInk
      : t.orbitCaptionLight
    : t.orbitCaption;
  const description = fill(caption, {
    m1: oneDecimal.format(published.masses[0]),
    m2: oneDecimal.format(published.masses[1]),
    m3: oneDecimal.format(published.masses[2]),
    distance: oneDecimal.format(closest.distance),
    pair: pairName(closest.pair),
    step: number.format(closest.step),
    seconds: oneDecimal.format(lightFilmSeconds(closest.step, steps)),
  });

  // Each row is marked as it is checked; the fate is checked last, since it runs on past the
  // window to the horizon, and the summary speaks once every row has been.
  const comparisons =
    state.phase === 'derived'
      ? fate.phase === 'derived'
        ? [...state.comparisons, fate.comparison]
        : state.comparisons
      : null;
  const checked = state.phase === 'derived' && fate.phase !== 'deriving';
  const differing = comparisons?.filter((row) => !row.exact) ?? [];

  const progress = state.phase === 'deriving' ? state.progress : null;
  const playingLine = (step: number, seconds: number) =>
    fill(t.orbitPlaying, {
      step: number.format(step),
      total: number.format(steps),
      clock: clock(seconds),
    });
  // The line under the drawing says what is happening now; the summary has a slot of its own,
  // so a line that changes length never moves the page beneath the section.
  const progressLine =
    state.phase === 'failed'
      ? ''
      : state.phase === 'waiting'
        ? t.orbitWaiting
        : state.phase === 'deriving'
          ? progressText(
              progress ?? { phase: 'beginnings', done: 0, total: orbit.generation.selectedIndex },
              orbit.generation,
              t,
              number,
            )
          : finished
            ? playingLine(steps, film)
            : playingLine(0, 0);
  const summary =
    state.phase === 'failed'
      ? t.orbitUnavailable
      : checked
        ? `${fill(t.orbitDerived, {
            seconds: oneDecimal.format(state.seconds),
            seed: seedShort(orbit.generation.seed),
            index: number.format(orbit.generation.selectedIndex),
            total: number.format(
              orbit.generation.candidatesPerAttempt * (orbit.generation.retryCount + 1),
            ),
            steps: number.format(orbit.generation.warmupSteps + steps),
          })} ${verdict(comparisons ?? [], t)}`
        : null;
  const line = beyond ? readout : ((still ? null : readout) ?? progressLine);
  const approach = derivedFate?.approach;
  const canApproach =
    beyond?.from === 'end' && !still && !rested && !!approach && reached < approach.taken;
  const canAgain = !still && (beyond ? rested : done);

  return (
    <section
      ref={section}
      id="orbit"
      tabIndex={-1}
      className={styles.orbit}
      aria-labelledby="orbit-title"
      data-phase={state.phase}
      data-exact={checked ? String(differing.length === 0) : undefined}
      data-fate={fate.phase === 'derived' ? fate.fate.outcome : undefined}
      data-beyond={beyond ? (rested ? 'rested' : 'running') : undefined}
      data-drawing={plateStill ? 'plate' : 'plane'}
      data-material={plateStill ? (material ?? undefined) : undefined}
    >
      <header className={styles.head}>
        <h2 id="orbit-title" className={styles.title}>
          {t.orbitTitle}
        </h2>
        <p className={styles.line}>{beyond ? t.afterTheFrameNote : t.orbitLine}</p>
      </header>
      <figure className={styles.figure}>
        <div
          ref={stage}
          className={styles.stage}
          data-drawing={plateStill ? 'plate' : 'plane'}
          data-material={plateStill ? (material ?? undefined) : undefined}
          style={
            plateStill && plate
              ? ({
                  '--plate-aspect': `${plate.frame.width} / ${plate.frame.height}`,
                  '--plate-ratio': plate.frame.width / plate.frame.height,
                  '--plate-ground': plateStill.tone,
                } as CSSProperties)
              : undefined
          }
        >
          {/* The work's still, untouched: the drawing lies over it and never alters a pixel. It is
              fetched once the section is a screen away, as its derivation begins, rather than at
              each browser's own lazy margin, which Firefox keeps close to the viewport. */}
          {plateStill ? (
            <img
              key={material}
              className={styles.still}
              src={plateStill.src}
              srcSet={plateStill.srcSet}
              sizes={plateStill.srcSet ? STILL_SIZES : undefined}
              width={plateStill.width}
              height={plateStill.height}
              alt=""
              decoding="async"
              loading={near ? 'eager' : 'lazy'}
            />
          ) : null}
          <canvas ref={trails} className={styles.layer} aria-hidden="true" />
          <canvas ref={continued} className={styles.layer} aria-hidden="true" />
          <canvas ref={marks} className={styles.layer} aria-hidden="true" />
        </div>
        <figcaption className={styles.caption}>{description}</figcaption>
      </figure>
      <div className={styles.score}>
        <canvas ref={events} className={styles.events} aria-hidden="true" />
        <div className={styles.readoutRow}>
          <p className={styles.readout}>{line}</p>
          <div className={styles.words}>
            {state.phase === 'derived' && (finished || beyond) ? (
              <>
                {canApproach ? (
                  <button
                    type="button"
                    className={styles.again}
                    onClick={() => goBeyond('approach')}
                  >
                    {t.toTheEjection}
                  </button>
                ) : null}
                {canAgain ? (
                  <button type="button" className={styles.again} onClick={again}>
                    {t.again}
                  </button>
                ) : null}
                {derivedFate ? (
                  <button
                    type="button"
                    className={styles.again}
                    aria-pressed={!!beyond}
                    onClick={() => (beyond ? leaveBeyond() : goBeyond('end'))}
                  >
                    {t.afterTheFrame}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
      <OrbitRecord
        orbit={orbit}
        t={t}
        locale={locale}
        comparisons={comparisons}
        summary={summary}
      />
    </section>
  );
}
