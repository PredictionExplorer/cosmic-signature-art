import {
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { OrbitPlate } from '@/lib/art/orbit-plate';
import type { Messages } from '@/lib/i18n/en';
import type { BeyondPath } from '@/lib/physics/beyond';
import type { FramedSamples } from '@/lib/physics/framing';
import type { DerivedFate } from '@/lib/physics/orbit';
import { FADE_MS, REST_MS, beyondFact, furtherOn, heldScript } from './orbit-beyond';
import { pictureOn, type Material, type Surface } from './orbit-picture';

/*
  After the frame, as the visitor moves through it (docs/after-the-frame.md §8.3 and §8.4).

  The visitor is asked whom to stay with; with their answer the path past the frame is
  performed; the still stands alone in silence; and what happened is told. This module owns
  where that has got to, what the performance last said, what each picture the visitor may be
  in shows of the path, and where the focus goes as each word that was pressed gives way.

  The performance itself and its words are orbit-beyond.ts; this is its state. Two things are
  the section's, since they belong to the whole stage: what else must leave it as After the
  frame arrives (the twin, the ring), and the page's scroll to the picture (orbit-room.ts).
*/

/**
 * After the frame, as it stands: a count, so that a repeat starts afresh, and where it has got
 * to. The answer is the body the picture stays with (none: the frame, held where the film left
 * it), so there is one only once the question is answered, or was not asked.
 */
export type Beyond = { run: number } & (
  { phase: 'choosing' } | { phase: 'running' | 'resting' | 'told'; kept: number | null }
);

/** Asked whom to stay with; performed; then the still alone, in silence; then told. */
export type BeyondPhase = Beyond['phase'];

/** What moves After the frame on. */
export type BeyondAct =
  /** Asked for, or asked for again: begun with the question (`whom`) where one is asked. */
  | { type: 'ask'; whom: boolean }
  /** The answer: the body to stay with, or (null) the frame. Time resumes, afresh. */
  | { type: 'stay'; body: number | null }
  /** The performance has reached its end: the still alone, in silence. */
  | { type: 'rest' }
  /** What happened is told: at the visitor's word, or once the rest is over. */
  | { type: 'tell' }
  /** Back at the frame. */
  | { type: 'leave' };

/**
 * Where After the frame stands after an act. Each asking and each answer is a performance of
 * its own (the count goes up); a rest follows only a performance, and a telling whatever stood;
 * what cannot follow leaves it as it was.
 */
export function beyondReducer(state: Beyond | null, act: BeyondAct): Beyond | null {
  switch (act.type) {
    case 'ask': {
      const run = (state?.run ?? 0) + 1;
      return act.whom ? { run, phase: 'choosing' } : { run, phase: 'running', kept: null };
    }
    case 'stay':
      return { run: (state?.run ?? 0) + 1, phase: 'running', kept: act.body };
    case 'rest':
      return state?.phase === 'running' ? { ...state, phase: 'resting' } : state;
    case 'tell':
      // Told before the question was answered (it cannot be asked for there today), it is the
      // frame's telling: no body was stayed with.
      return state && state.phase !== 'told'
        ? { run: state.run, phase: 'told', kept: state.phase === 'choosing' ? null : state.kept }
        : state;
    case 'leave':
      return null;
  }
}

/** A picture is read at no size in particular: a body is on it or off it at every size. */
const ANY_SIZE = { width: 1, height: 1, ratio: 1 };

export function useBeyond({
  path,
  fate,
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
}: {
  /** The orbit past its window, once carried; null where it could not be, undefined until known. */
  path: BeyondPath | null | undefined;
  fate: DerivedFate | null;
  /** The recorded window as the work's frame places it; none in the plane. */
  placed: FramedSamples | null;
  /** The material on view, where the plate bears the orbit out in it. */
  material: Material | null;
  plate: OrbitPlate | undefined;
  /** The film's pace, in steps a second. */
  pace: number;
  /** Nothing plays: Further on steps the picture. */
  still: boolean;
  t: Messages;
  number: Intl.NumberFormat;
  section: RefObject<HTMLElement | null>;
  /** The line beneath the picture: the focus is handed it when a word it stood on goes. */
  telling: RefObject<HTMLParagraphElement | null>;
  wordsRow: RefObject<HTMLDivElement | null>;
}) {
  /** After the frame as the visitor last left it; `beyond`, below, is what the section shows. */
  const [went, act] = useReducer(beyondReducer, null);
  /** The plate's word asked for After the frame before its path was known: it is awaited. */
  const [awaited, setAwaited] = useState(false);
  /** The material After the frame was last asked for in: its pictures are read then, and kept. */
  const [wanted, setWanted] = useState<Material | null>(null);
  /** What the performance last said… */
  const [line, setLine] = useState<string | null>(null);
  /** …whether Further on would save a wait from where it stands… */
  const [worthIt, setWorthIt] = useState(false);
  /** …and a count of the times it was taken, so the drawing follows the playhead it moved. */
  const [jumps, setJumps] = useState(0);
  /** How far the performance has run, so a resize or a return carries on from it. */
  const live = useRef<{ key: string; sample: number; began?: number } | null>(null);
  /**
   * The focus is to go to the line once it has its words: the visitor has asked for the
   * question (the keyboard and the screen reader are taken to it, and its answers follow it),
   * or has answered it, and the word that answered is gone.
   */
  const handOn = useRef(false);
  /** The visitor asked to be told, so the focus goes to what is told. */
  const toldByHand = useRef(false);

  /**
   * After the frame can be performed: the fate is known, and the path past the window, on the
   * plate the window is drawn on. In the plane there is no frame for a body to leave.
   */
  const canGoBeyond = !!fate && !!path && !!placed;
  /**
   * Past the frame only for as long as it can be performed there. A plate turned to a material
   * the orbit is not drawn on (none today: every still bears its orbit out) is drawn in the
   * plane, where there is no frame for a body to leave: the section stands at the frame until
   * the plate is turned back. Then it stands past the frame as it did, and the page is not
   * moved to it: turning the plate did not ask for the orbit (orbit-room.ts).
   */
  const beyond = canGoBeyond ? went : null;
  /** Where After the frame has got to. At the frame it reads running: every reader asks `beyond` first. */
  const phase: BeyondPhase = went?.phase ?? 'running';
  const run = beyond?.run ?? null;
  const choosing = !!beyond && phase === 'choosing';
  const performing = !!beyond && !choosing;
  /** The body the picture is kept on past the frame; none where it is the work's frame, held. */
  const keptOn = beyond && beyond.phase !== 'choosing' ? beyond.kept : null;
  /**
   * Whether the picture draws the bodies where they were: only then can a line name one, and
   * only then is there a body to stay with (a mark made of two bodies' coordinates is none).
   */
  const bodiesDrawn = plate?.frame.projection === 'position';
  /**
   * Whether the visitor is asked whom to stay with: where the picture draws the bodies where
   * they were, and the path holds something to perform.
   */
  const asksWhom = (carried: BeyondPath | null | undefined) =>
    bodiesDrawn && !!carried && carried.samples > 1;

  /**
   * What each picture the visitor may be in shows of the path past the frame: the work's own
   * frame, held, and, where they are asked, the picture kept on each of the three. Read the
   * first time After the frame is asked for, and kept through leaving it and coming back: a
   * reading is the same at every size the plate is drawn at (a body is on the picture or off
   * it), so these stand for as long as the path and the material do. Light draws every
   * symmetry copy of a body, Ink the first alone: past the frame a plate turned to the other
   * material is read anew. At the frame a turn of the plate reads nothing: the readings wait
   * for the material they were asked for in, and are made again if the plate comes back to it.
   */
  const reads = !!went || (wanted !== null && wanted === material);
  const readings = useMemo(() => {
    if (!reads || !path || !fate || !placed || !material || !plate) return null;
    const on: Surface = { kind: 'plate', window: placed, frame: plate.frame, material };
    const pictures: (number | null)[] = bodiesDrawn && path.samples > 1 ? [null, 0, 1, 2] : [null];
    return pictures.map((kept) => ({
      kept,
      script: heldScript(
        path,
        pictureOn(on, ANY_SIZE, kept === null ? null : { path: path.pixels, body: kept }),
        fate,
        pace,
        bodiesDrawn,
      ),
    }));
  }, [reads, path, fate, placed, material, plate, pace, bodiesDrawn]);
  /** The reading of the picture on view, while it is performed or told. */
  const script = performing ? (readings?.find((one) => one.kept === keptOn)?.script ?? null) : null;
  /**
   * What happened in each of those pictures, sentence by sentence. Only the one the visitor
   * was in is ever told; all of them are laid out unseen in the line's room, so that the room
   * kept under the picture is the room of the longest, in this language and at this width,
   * from the moment the question is asked: nothing moves when the telling comes.
   */
  const tellings = useMemo(
    () =>
      readings && path && fate
        ? readings.map((one) => ({
            kept: one.kept,
            said: beyondFact(one.script, path, fate, t, number),
          }))
        : [],
    [readings, path, fate, t, number],
  );
  /** What happened, once it is told: of the picture on view, in the material on view. */
  const fact =
    performing && phase === 'told'
      ? (tellings.find((one) => one.kept === keptOn)?.said ?? null)
      : null;
  /** The path held nothing past the window to perform: what happened is said at once. */
  const nothingPerformed = script?.ending.sample === 0;

  /** What happened past the frame is told: the line under the still says it (`fact`). */
  const tell = () => {
    setLine(null);
    act({ type: 'tell' });
  };
  useEffect(() => {
    if (phase !== 'told' || !toldByHand.current) return;
    toldByHand.current = false;
    // The word that was pressed is gone: the keyboard and the screen reader go to what it told.
    telling.current?.focus({ preventScroll: true });
  }, [phase, telling]);
  useEffect(() => {
    if (!handOn.current) return;
    // Not before the line has its words: the question, or whom the picture stays with, which
    // the drawing says a render after the answer. A focus on an empty line says nothing.
    if (phase !== 'choosing' && !(phase === 'running' && line)) return;
    handOn.current = false;
    telling.current?.focus({ preventScroll: true });
  }, [run, phase, line, telling]);
  // The performance over, the still stands alone and nothing is said or offered for a while.
  const afterRest = useEffectEvent(tell);
  const resting = !!beyond && phase === 'resting';
  useEffect(() => {
    if (!resting) return;
    const timer = setTimeout(afterRest, FADE_MS + REST_MS);
    return () => clearTimeout(timer);
  }, [resting]);

  /** Back at the frame: nothing of the performance is kept. */
  const leave = () => {
    handOn.current = false;
    live.current = null;
    setLine(null);
    act({ type: 'leave' });
  };

  return {
    beyond,
    phase,
    run,
    choosing,
    keptOn,
    canGoBeyond,
    bodiesDrawn,
    /** Whether the visitor is asked whom to stay with on the path as it is known. */
    asks: asksWhom(path),
    awaited,
    line,
    worthIt,
    jumps,
    script,
    tellings,
    fact,
    nothingPerformed,
    /**
     * After the frame, asked for now on a path that is known: a new performance. Where the
     * visitor is asked whom to stay with and `focus` says so, the focus goes to the question,
     * whose answers follow it: it is said by the focus it is given, whichever word asked.
     */
    ask: (carried: BeyondPath | null | undefined, focus: boolean) => {
      handOn.current = focus && asksWhom(carried);
      setAwaited(false);
      setWanted(material);
      setWorthIt(false);
      setLine(null);
      act({ type: 'ask', whom: asksWhom(carried) });
    },
    /** The plate's word asked before the path past the frame was known: it is awaited. */
    awaitPath: () => setAwaited(true),
    /** The path is known to hold nothing to perform: the wait is over. */
    stopAwaiting: () => setAwaited(false),
    /** The visitor's answer: stay with one of the three, or (null) with the frame. Time resumes. */
    stay: (body: number | null) => {
      handOn.current = true;
      setWorthIt(false);
      setLine(null);
      act({ type: 'stay', body });
    },
    /** Tell me: told at the visitor's word, and the focus goes to what is told. */
    tellNow: () => {
      toldByHand.current = true;
      tell();
    },
    /**
     * Further on: to the next moment of the performance. Kept in its place while it would save
     * nothing, and at the performance's end, the word does nothing: it never turns into the
     * word that tells, or a visitor stepping with it (where nothing plays it is the only way
     * on) would step on into whatever came to stand there. Tell me tells.
     */
    goFurther: () => {
      if (!script || !live.current || !worthIt) return;
      const target = furtherOn(script, Math.floor(live.current.sample), still);
      if (target === 'end') return;
      live.current.sample = target;
      setJumps((count) => count + 1);
    },
    leave,
    /** The twin takes the stage: After the frame gives way, performed or still awaited. */
    giveWay: () => {
      leave();
      setAwaited(false);
    },
    /** For the drawing alone: the playhead it carries, and how the performance reports. */
    forDrawing: {
      live,
      /** What the line says where the performance stands, and whether Further on would save a wait. */
      said: (words: string, further: boolean) => {
        setWorthIt(further);
        setLine(words);
      },
      /** Performed to its end, the drawing gives way to the still, and nothing is said. */
      ended: () => {
        // Where the computation lost its energy inside the recorded window there is nothing
        // past it to perform, and no rest to take: what happened is said at once.
        if (nothingPerformed) {
          tell();
          return;
        }
        // The words go for the rest: a focus that stood on one stays in the section.
        if (wordsRow.current?.contains(document.activeElement))
          section.current?.focus({ preventScroll: true });
        setLine(null);
        act({ type: 'rest' });
      },
    },
  };
}
