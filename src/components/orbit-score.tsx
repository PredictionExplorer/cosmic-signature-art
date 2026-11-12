'use client';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Locale } from '@/lib/i18n/routing';
import type { Messages } from '@/lib/i18n/en';
import { fill } from '@/lib/i18n/format';
import type { WorkOrbit } from '@/lib/art/orbit-records';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import {
  lightFilmDuration,
  lightFilmFrames,
  lightFilmSeconds,
  stepsDrawnAt,
} from '@/lib/physics/light-film';
import { principalPlane, type Plane } from '@/lib/physics/plane';
import { useMotion } from './motion-provider';
import { useRememberedExpression, type Expression } from './turn';
import { layers } from './orbit-layers';
import { pictureOn, type Material, type Surface } from './orbit-picture';
import { orbitPainter } from './orbit-painter';
import { beyondLine, longestBeyondLine, performBeyond, worthGoingOn } from './orbit-beyond';
import { useBeyond } from './orbit-beyond-state';
import type { BeyondPath } from '@/lib/physics/beyond';
import { STRIDE, useOrbitDerivation, type Derivation } from './orbit-derivation';
import { useOrbitPresence, usePlateWord } from './orbit-presence';
import { OrbitProofAct } from './orbit-record';
import { usePictureRoom } from './orbit-room';
import type { Sculpture } from './orbit-sculpture';
import { OrbitSlider } from './orbit-timeline';
import { performTwin, twinLine } from './orbit-twin';
import { useTwin } from './orbit-twin-state';
import { performWindow, playingLine, windowLine, windowScore } from './orbit-window';
import { derivedSummary, progressText } from './orbit-proof';
import { drawChoice, type Choice } from './orbit-choice';
import { useWindowClock } from './orbit-clock';
import { useChoosing } from './orbit-choosing';
import { OrbitFigure } from './orbit-figure';
import { OrbitSaid, Sentences } from './orbit-said';
import { PressGuard, usePresses } from './orbit-word';
import { OrbitWords, type Offered } from './orbit-words';
import styles from './orbit-score.module.css';

/** The derivation as the section finds it: nothing is derived before the section is near. */
type State = { phase: 'waiting' } | Derivation;

/** Whether this browser could draw the orbit in depth: only then is it sampled for it. */
const canTurn = () => typeof WebGL2RenderingContext !== 'undefined';

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
 * After the frame (third-physics.md §5.6; docs/after-the-frame.md §8.3 and §8.4): the same
 * physics runs on past the recorded window, at the film's pace. Where the picture draws the
 * bodies where they were, the visitor is first asked whom to stay with: the frame, held where
 * the film left it, or one of the three, which then holds still in the picture. It runs until
 * what that picture shows resolves; then the still alone, a silence, and one line of what
 * happened (orbit-beyond.ts).
 *
 * In the hand (docs/first-light.md §14): where the browser can draw it, the orbit can be taken in
 * hand and turned in depth, and given back to the generator's view (orbit-sculpture.tsx). The
 * score is a slider, so the moment can be set either way (orbit-timeline.tsx), and the closest
 * approach can be played slowly, as a film slows for the moment that matters.
 *
 * One part in a trillion (docs/first-light.md §15): a twin of the orbit, one body moved by a
 * trillionth, carried past the frame beside the work until it parts (orbit-twin.tsx).
 *
 * The section is assembled from its parts, and this component is where they meet.
 *
 * - What is known: where the section stands to the visitor (orbit-presence.ts) and the
 *   derivation (orbit-derivation.ts).
 * - Who owns what changes: the recorded window's clock (orbit-clock.ts), After the frame
 *   (orbit-beyond-state.ts), the twin (orbit-twin-state.ts), the choosing by hand
 *   (orbit-choosing.ts) and the picture's room on the page (orbit-room.ts).
 * - What is drawn: the canvases (orbit-layers.ts), the picture on them (orbit-picture.ts) and
 *   its painter (orbit-painter.ts), then one of four things, each performed by its own module:
 *   the question (orbit-choice.ts), After the frame (orbit-beyond.ts), the twin (orbit-twin.tsx)
 *   or the recorded window (orbit-window.ts).
 * - What is shown: the figure (orbit-figure.tsx) with the orbit in depth (orbit-sculpture.tsx),
 *   the slider (orbit-timeline.tsx), the line (orbit-said.tsx), the words (orbit-words.tsx) and
 *   the record (orbit-record.tsx).
 *
 * What is left here belongs to the whole stage: the four changes of what stands on it, the
 * plate's word, the one drawing that hands on to the four, and the choice of what the line says.
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
  /** The line beneath the picture and its words: what must stand in view with it past the frame. */
  const beneath = useRef<HTMLDivElement>(null);
  /** The line and the words themselves: the focus is handed on when a word it stood on goes. */
  const telling = useRef<HTMLParagraphElement>(null);
  const wordsRow = useRef<HTMLDivElement>(null);
  const trails = useRef<HTMLCanvasElement>(null);
  const continued = useRef<HTMLCanvasElement>(null);
  const marks = useRef<HTMLCanvasElement>(null);
  /**
   * The bodies' numbers while the visitor chooses among them: their canvas, and the question's
   * picture once drawn, which draws them again when the ring moves (the picture itself is not)
   * and knows what a pointer finds in it.
   */
  const names = useRef<HTMLCanvasElement>(null);
  const choice = useRef<Choice | null>(null);
  const tooSoon = usePresses();
  const events = useRef<HTMLCanvasElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const sculpture = useRef<Sculpture | null>(null);
  /** The drawing's animation frame. */
  const frame = useRef(0);
  const { near, inView, bringNear } = useOrbitPresence(section);
  /** The orbit is turned from the generator's view now. */
  const [turned, setTurned] = useState(false);
  const { paused, reducedMotion, theatre } = useMotion();
  const still = paused || reducedMotion || theatre === 'hushed';
  const steps = orbit.generation.steps;
  const film = lightFilmDuration(steps);
  /** The film's pace: steps of the window per second of the Light film. */
  const pace = steps / film;
  const clock = useWindowClock({ film, still });
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const oneDecimal = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    [locale],
  );

  const {
    derivation,
    framed,
    fate,
    beyond: path,
    space,
  } = useOrbitDerivation({
    orbit,
    near,
    pace,
    frame: plate?.frame,
    depth: canTurn(),
    onBeyond: (carried) => pathCame(carried),
  });
  // Nothing is derived before the section is near, which is never on the server.
  const state: State = !near
    ? { phase: 'waiting' }
    : typeof Worker === 'undefined'
      ? { phase: 'failed' }
      : derivation;

  const result = state.phase === 'derived' ? state.result : null;
  const derivedFate = fate.phase === 'derived' ? fate.fate : null;
  const plane = useMemo<Plane | null>(
    () => (result ? principalPlane(result.samples.positions, result.samples.count) : null),
    [result],
  );
  /** One part in a trillion: the twin, while it stands on the stage. */
  const twinAct = useTwin({ orbit, steps, result, frame: plate?.frame });
  const { twin, following } = twinAct;

  // The plate shows the expression the page's plate shows: the visitor's choice, remembered for
  // the visit, else the page's opening; and its still lies beneath only where the frame is borne
  // out for that expression. A window that could not be placed is drawn in its plane.
  const remembered = useRememberedExpression();
  const onPage = (both && remembered) || opening;
  const material: Material | null = onPage && plate?.stills[onPage] ? onPage : null;
  const plateStill =
    material && framed !== null && state.phase !== 'failed' ? plate!.stills[material]! : null;
  const placed = plateStill && framed ? framed : null;
  /** What the orbit is drawn on, once its places there are known: a plate waits for the window's. */
  const surface: Surface | null = plateStill
    ? placed && material && plate
      ? { kind: 'plate', window: placed, frame: plate.frame, material }
      : null
    : plane && result
      ? { kind: 'plane', plane, count: result.samples.count }
      : null;
  /** After the frame, as the visitor moves through it. */
  const past = useBeyond({
    path,
    fate: derivedFate,
    placed,
    material,
    plate,
    pace,
    still,
    t,
    number,
    section,
    telling,
    wordsRow,
  });
  const { beyond, phase, run, choosing, keptOn, canGoBeyond, awaited, script } = past;
  const room = usePictureRoom({
    section,
    stage,
    beneath,
    wordsRow,
    pastFrame: !!beyond,
    run,
    reducedMotion,
  });
  const { ringed, aiming, point, unpoint, renew, hand } = useChoosing({
    stage,
    choice,
    asked: beyond && choosing ? beyond.run : null,
    tooSoon,
    onStay: (body) => stay(body),
  });

  // The four changes of what stands on the stage. Each is the visitor's own act, and each says
  // what must leave with it: the ring, the twin, the words' place on the page.
  /**
   * After the frame takes the stage, on a path that is known. The page may come to its picture:
   * always when the visitor has just asked, and only if they are still here when it `waited`
   * for its path. Where they are asked whom to stay with and `focus` says so, the focus goes
   * to the question.
   */
  const startBeyond = (waited: boolean, carried: BeyondPath | null, focus: boolean) => {
    room.arrive(waited ? 'if-here' : 'bring');
    twinAct.leave();
    unpoint();
    past.ask(carried, focus);
  };
  /** After the frame, asked for now: by its word here, by the plate's, or again. */
  const goBeyond = () => startBeyond(false, path ?? null, true);
  /**
   * The path past the frame is known at last, or known to hold nothing: the plate's word may
   * have asked before it was. The wait is over either way, and the window is the visitor's.
   */
  const pathCame = (carried: BeyondPath | null) => {
    if (!awaited) return;
    if (!carried) {
      past.stopAwaiting();
      return;
    }
    // The plate's word left the focus on the section. If it is still there the question is
    // handed it, as it is by the section's own word; a visitor who has gone on is left be.
    startBeyond(true, carried, document.activeElement === section.current);
  };
  /** The visitor's answer: stay with one of the three, or (null) with the frame. Time resumes. */
  const stay = (body: number | null) => {
    room.arrive('bring');
    unpoint();
    past.stay(body);
  };
  /** One part in a trillion: After the frame gives way, and the twin is followed if it is new. */
  const goTwin = () => {
    if (beyond) room.keepWords();
    unpoint();
    past.giveWay();
    twinAct.go();
  };
  /** Back to the frame from After the frame: the recorded window, whole. */
  const leaveBeyond = () => {
    room.keepWords();
    unpoint();
    past.leave();
    clock.rest();
  };
  /** Back to the frame from beside the twin. */
  const leaveTwin = () => {
    twinAct.leave();
    clock.rest();
  };

  // The plate's word: go on past the frame as soon as the path past it is known, bringing the
  // picture into view. Asking derives the orbit if the visitor has not come near it yet, and
  // brings the section into view to wait.
  usePlateWord(() => {
    bringNear();
    // The word was a link to here: the keyboard and the screen reader come here too.
    section.current?.focus({ preventScroll: true });
    if (beyond && (phase === 'running' || phase === 'choosing')) {
      // Already past the frame: its picture comes back into view, whole, and a question that
      // stands unanswered is said again by the focus it is given. The picture is new under
      // the pointer that pressed the word: a second press there is not yet an answer.
      room.bring();
      if (phase === 'choosing') {
        renew();
        telling.current?.focus({ preventScroll: true });
      }
      return;
    }
    // Its path known, the performance begins (again, where it had been told), and brings its
    // picture into view as it does. One scroll, to where it will stand: a second, begun here,
    // would carry the page past it.
    if (canGoBeyond) {
      goBeyond();
      return;
    }
    section.current?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    // Neither a path that could not be carried, nor one a failed derivation will never send,
    // is waited for.
    if (path === undefined && derivation.phase !== 'failed' && fate.phase !== 'failed')
      past.awaitPath();
  });

  // The drawing: trails accumulate, the bodies ride on a layer above, and the score beneath
  // carries the three separations with the published events. On the plate the drawing lies over
  // the still, in its material: light added on night, graphite and sumi on paper. At the film's
  // pace when motion is welcome and the section is in view; all at once otherwise.
  const draw = useEffectEvent((): (() => void) | void => {
    cancelAnimationFrame(frame.current);
    // The performance over, its last frame stands under the still, which the stylesheet brings
    // back over it (orbit-score.module.css): nothing is drawn again, and no canvas is sized,
    // until the visitor goes on.
    if (beyond && (phase === 'resting' || phase === 'told')) return;
    // A plate waits for the window's places on it; the plane for its own.
    if (!result || !surface) return;
    const sheet = layers({
      trails: trails.current,
      continued: continued.current,
      marks: marks.current,
      events: events.current,
      names: names.current,
    });
    if (!sheet) return;
    // Past the frame the picture may stay with one body: the same frame, moved along with it.
    const picture = pictureOn(
      surface,
      sheet,
      beyond && beyond.phase === 'running' && beyond.kept !== null && path
        ? { path: path.pixels, body: beyond.kept }
        : null,
    );
    const hues = orbit.bodyHues;
    const painter = orbitPainter({
      ...sheet,
      picture,
      hues,
      masses: result.masses,
      closestApproach: result.closestApproach,
      steps,
      stride: STRIDE,
    });
    /** What each of the four is drawn with: the layers, the picture on them, and its painter. */
    const easel = { ...sheet, picture, painter };
    clock.forDrawing.laid(null);
    choice.current = null;

    // The question. The three wait where the film left them, each with its number, until the
    // visitor says whom to stay with. Nothing plays.
    if (beyond && phase === 'choosing') {
      choice.current = drawChoice({
        ...easel,
        masses: result.masses,
        font: sheet.font(),
        ground: plateStill?.tone ?? 'transparent',
      });
      choice.current.ring(ringed);
      return;
    }
    // After the frame, in the picture the visitor chose. The score is not shown, and not built.
    if (beyond && script && path) {
      const { said } = past.forDrawing;
      return performBeyond({
        ...easel,
        path,
        script,
        key: String(beyond.run),
        film,
        still,
        inView,
        live: past.forDrawing.live,
        frame,
        // Until the bodies have been brought to where the picture holds them, time waits, and
        // there is nothing to go further on to.
        speak: (sample, brought) =>
          said(
            beyondLine(script, path, sample, t, number),
            brought && worthGoingOn(script, sample, still),
          ),
        onEnd: past.forDrawing.ended,
      });
    }
    // One part in a trillion: the work and its twin past the frame, and on the strip beneath,
    // in the score's place, the growth of the gap between them.
    if (twin?.phase === 'ready' && derivedFate && plate && picture.kind === 'plate')
      return performTwin({
        ...easel,
        run: twin.run,
        fate: derivedFate,
        key: String(twin.repeat),
        plate,
        result,
        dt: orbit.generation.dt,
        steps,
        pace,
        stride: STRIDE,
        still,
        inView,
        live: twinAct.forDrawing.live,
        frame,
        speak: twinAct.forDrawing.said,
        onRested: twinAct.forDrawing.rested,
      });
    // The recorded window at its clock, over its score.
    const score = windowScore(sheet.strip, result, steps, STRIDE, hues);
    if (!score) return;
    // Asked for After the frame, the window waits whole for its path rather than starting over.
    // Where motion is unwelcome it is drawn whole, until the visitor takes the clock.
    if (awaited || following || clock.untouched) clock.forDrawing.holdWhole();
    const said = clock.forDrawing.said;
    clock.forDrawing.laid(
      performWindow({
        ...easel,
        score,
        count: result.samples.count,
        steps,
        stride: STRIDE,
        film,
        inView,
        transport: clock.forDrawing.transport,
        frame,
        slider,
        sculpture,
        say: (now) =>
          said(
            now,
            windowLine(
              now,
              { steps, film, closest: result.closestApproach },
              { t, number, oneDecimal },
            ),
          ),
        onEnd: clock.forDrawing.ended,
      }),
    );
    return () => cancelAnimationFrame(frame.current);
  });

  useEffect(
    () => draw(),
    [
      result,
      plane,
      framed,
      material,
      still,
      inView,
      beyond,
      derivedFate,
      path,
      phase,
      past.jumps,
      awaited,
      twin,
    ],
  );
  // The ring moves without the picture being drawn again: the numbers' layer alone is.
  useEffect(() => {
    choice.current?.ring(ringed);
  }, [ringed]);

  const resized = useEffectEvent(() => {
    // At another size the picture is not where a resting mouse found it: it aims afresh when
    // it next moves.
    point('aim', null);
    draw();
  });
  const refit = useEffectEvent(() => room.fit());
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      resized();
    });
    observer.observe(node);
    // What stands beneath the picture takes another height at another width (a line more of
    // what happened): the plate is fitted again.
    const under = new ResizeObserver(() => refit());
    if (beneath.current) under.observe(beneath.current);
    return () => {
      observer.disconnect();
      under.disconnect();
    };
  }, []);

  // Each row is marked as it is checked; the fate is checked last, since it runs on past the
  // window to the horizon, and the summary speaks once every row has been.
  const comparisons =
    state.phase === 'derived'
      ? fate.phase === 'derived'
        ? [...state.comparisons, fate.comparison]
        : state.comparisons
      : null;
  const checked = state.phase === 'derived' && fate.phase !== 'deriving';
  /** Whether every row is the record's, once every row has been checked. */
  const exact = checked ? (comparisons ?? []).every((row) => row.exact) : null;

  const progress = state.phase === 'deriving' ? state.progress : null;
  const standsAt = (step: number, seconds: number) => playingLine(step, seconds, steps, t, number);
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
          : clock.finished
            ? standsAt(steps, film)
            : standsAt(0, 0);
  const summary =
    state.phase === 'failed'
      ? t.orbitUnavailable
      : checked
        ? derivedSummary(state.seconds, orbit.generation, comparisons ?? [], t, number, oneDecimal)
        : null;
  const factLine: ReactNode = past.fact ? <Sentences said={past.fact} t={t} /> : null;
  /** The question and what is told are read, in the book face; the running line is metered. */
  const read = !!beyond && (phase === 'choosing' || phase === 'told');
  /** The longest line a performance can say here, for the room it is to keep. */
  const longestLine = beyond
    ? longestBeyondLine(
        { names: past.bodiesDrawn, asks: past.asks, horizon: orbit.fate.horizonSteps },
        t,
        number,
        oneDecimal,
      )
    : null;
  const line: ReactNode = twin
    ? twinLine(twin, twinAct, { steps, pace }, { t, number, locale })
    : beyond
      ? phase === 'told'
        ? factLine
        : phase === 'choosing'
          ? t.beyondAsk
          : past.line
      : ((clock.untouched ? null : clock.line) ?? progressLine);
  const derived = state.phase === 'derived';
  /**
   * The clock's word follows the clock as the visitor finds it: Pause while it plays, never
   * where nothing does; at the end, Again for whoever has watched it.
   */
  const clockWord = clock.playing
    ? t.pause
    : clock.atEnd && (clock.chosen || !still)
      ? t.again
      : t.play;
  const clockStep = stepsDrawnAt(clock.state.seconds, steps);

  const offered: Offered | null = !derived
    ? null
    : beyond
      ? {
          act: 'beyond',
          phase,
          worthIt: past.worthIt,
          onFurther: past.goFurther,
          onTell: past.tellNow,
          onAgain: past.nothingPerformed ? null : goBeyond,
          onLeave: leaveBeyond,
          onTwin: placed ? goTwin : null,
        }
      : twin
        ? {
            act: 'twin',
            onAgain: twinAct.rested && !still ? goTwin : null,
            onBeyond: canGoBeyond ? goBeyond : null,
            onLeave: leaveTwin,
          }
        : {
            act: 'window',
            clockWord,
            onClock: clock.playPause,
            // Played slowly from a little before it; at rest on it where nothing plays.
            onClosest: () =>
              clock.toClosest(lightFilmSeconds(orbit.published.closestApproach.step, steps)),
            onGeneratorView: turned ? () => sculpture.current?.back() : null,
            onBeyond: canGoBeyond && clock.finished ? goBeyond : null,
            onTwin: derivedFate && clock.finished && placed ? goTwin : null,
          };

  return (
    <PressGuard.Provider value={tooSoon}>
      {/* Act one, the show (docs/first-light.md §17): the orbit performed and held, on night. */}
      <section
        ref={section}
        id="orbit"
        tabIndex={-1}
        className={styles.orbit}
        style={
          plateStill && plate
            ? ({ '--plate-ratio': plate.frame.width / plate.frame.height } as CSSProperties)
            : undefined
        }
        aria-labelledby="orbit-title"
        data-phase={state.phase}
        data-exact={exact === null ? undefined : String(exact)}
        data-fate={fate.phase === 'derived' ? fate.fate.outcome : undefined}
        data-beyond={beyond ? phase : undefined}
        data-kept={keptOn !== null ? keptOn + 1 : undefined}
        data-twin={
          twin
            ? twin.phase === 'ready'
              ? twinAct.rested
                ? 'rested'
                : 'running'
              : twin.phase
            : undefined
        }
        data-drawing={plateStill ? 'plate' : 'plane'}
        data-material={plateStill ? (material ?? undefined) : undefined}
      >
        <header className={styles.head}>
          <h2 id="orbit-title" className={styles.title}>
            {t.orbitTitle}
          </h2>
          <p className={styles.line}>
            {twin
              ? fill(t.oneInATrillionNote, { body: 1 })
              : beyond
                ? // Both answers are said from the moment the question is asked, whatever the
                  // answer: a note that grew a line as a body was chosen would move the picture
                  // the visitor had just pressed.
                  past.asks
                  ? t.afterTheFrameNoteAsk
                  : t.afterTheFrameNote
                : t.orbitLine}
          </p>
        </header>
        <OrbitFigure
          stage={stage}
          trails={trails}
          continued={continued}
          marks={marks}
          names={names}
          sculpture={sculpture}
          orbit={orbit}
          t={t}
          oneDecimal={oneDecimal}
          number={number}
          on={
            plateStill && plate && material
              ? { frame: plate.frame, still: plateStill, material }
              : null
          }
          near={near}
          space={space}
          still={still}
          act={beyond ? 'beyond' : twin ? 'twin' : 'window'}
          labelled={phase === 'running' || phase === 'choosing'}
          hand={hand}
          aimed={aiming}
          onTurned={setTurned}
          onPlayPause={clock.playPause}
        />
        <div ref={beneath} className={styles.score}>
          <div className={styles.strip}>
            <canvas ref={events} className={styles.events} aria-hidden="true" />
            {derived && !beyond && !twin ? (
              <OrbitSlider
                slider={slider}
                frames={lightFilmFrames(steps)}
                label={t.orbitTimeLabel}
                valueText={standsAt(clockStep, clock.state.seconds)}
                disabled={awaited}
                onScrub={clock.scrub}
              />
            ) : null}
          </div>
          <div className={styles.readoutRow}>
            <OrbitSaid
              telling={telling}
              t={t}
              line={line}
              read={read}
              live={
                !!beyond &&
                (phase === 'resting' || phase === 'told' || (phase === 'running' && still))
              }
              onStay={derived && choosing ? stay : null}
              onPoint={(by, body) => point(by === 'focus' ? 'focus' : 'hover', body)}
              room={
                beyond && longestLine !== null
                  ? { asks: past.asks, tellings: past.tellings, longestLine }
                  : null
              }
            />
            <OrbitWords row={wordsRow} t={t} offered={offered} />
          </div>
        </div>
      </section>
      <OrbitProofAct
        orbit={orbit}
        t={t}
        locale={locale}
        comparisons={comparisons}
        exact={exact}
        summary={summary}
        energy={derivedFate?.energy ?? null}
      />
    </PressGuard.Provider>
  );
}
