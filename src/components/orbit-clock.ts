import { useRef, useState } from 'react';
import {
  letGo,
  pause,
  play,
  restingAt,
  scrub,
  toClosest,
  type Transport,
} from '@/lib/first-light/transport';
import { LIGHT_FILM } from '@/lib/physics/light-film';
import type { Clock, WindowScene } from './orbit-window';

/**
 * How the window came to stand at its end. It stands whole for other reasons too (drawn at once
 * where motion is unwelcome, or waiting for the plate's word), and then there is none: nothing
 * was watched to an end, and no hand set it there.
 */
export type WindowEnd =
  /** Its film played out, a frame at a time. */
  | 'played'
  /** One late frame passed over its last second and more: a tab that came back to it. */
  | 'late'
  /** The visitor's hand set it there: the slider, let go on its last notch. */
  | 'hand'
  /** It was brought back whole, from past the frame or from beside the twin. */
  | 'returned';

/**
 * A film that passed over this much of itself unseen as it ended, in seconds, was not watched
 * to its end: the clock jumps to where the film would be when a frame comes late or a tab
 * comes back, and a hidden page's frames are drawn for nobody (orbit-window.ts). The end it
 * finds then is `late`. It is the film passed over that counts, not how long a frame took: a
 * film watched to its last half second is `played`, however long its last frame stalled.
 */
const LATE_SECONDS = 1;

/*
  The recorded window's clock, in the visitor's hands (docs/first-light.md §14).

  The clock itself is pure (src/lib/first-light/transport.ts), and the drawing keeps its time
  (orbit-window.ts). This hook owns what stands between them and the page: where the clock is,
  whether the visitor has taken it, what the drawing last said of it, and the acts by which a
  hand sets it. The window is drawn by the section; it reports here.
*/
export function useWindowClock({
  film,
  still,
  onTake,
}: {
  /** The Light film's length, in seconds. */
  film: number;
  /** Motion is unwelcome: nothing plays until the visitor asks. */
  still: boolean;
  /**
   * The visitor is taking the clock: what stood because of where it was is about to go. It is
   * told whether the window will stand whole no longer (`leavesEnd`), since the words offered
   * only where it stands whole go with that.
   */
  onTake?: (leavesEnd: boolean) => void;
}) {
  /**
   * Where in the Light film the drawing stands. It plays on its own once the section is in view,
   * from the window's first step, unless motion is unwelcome.
   */
  const transport = useRef<Transport>({ kind: 'playing', seconds: 0, slowAt: null });
  /** The window as last laid out, so the clock can move it without laying it out again. */
  const scene = useRef<WindowScene | null>(null);
  /** The visitor has taken the clock: Play, Pause, the slider or the closest approach. */
  const [chosen, setChosen] = useState(false);
  /** The clock and the line, as the drawing last said them. */
  const [state, setState] = useState<Clock>({ kind: 'playing', seconds: 0 });
  const [line, setLine] = useState<string | null>(null);
  /** The window has been performed to its end, or brought back whole. */
  const [done, setDone] = useState(false);
  /** How it came to stand at its end, while it stands there by one of those ways. */
  const [end, setEnd] = useState<WindowEnd | null>(null);
  /**
   * The slider's last notch, in frames of the Light film. It is the film's end: a frame short of
   * it the clock would rest one frame from the end under a window drawn whole.
   */
  const lastNotch = Math.round(film * LIGHT_FILM.fps) - 1;

  /**
   * The clock as the visitor finds it. Where motion is unwelcome nothing plays until they ask, so
   * until they take the clock it rests with the window whole: also in the moment between the
   * derivation and the window's first drawing, while the transport still holds the performance it
   * would begin where motion is welcome. A slider or a word taken in that moment acts on what the
   * visitor sees, never on a performance that is not running.
   */
  const untouched = still && !chosen;
  const found = (): Transport => (untouched ? restingAt(film, film) : transport.current);
  /**
   * Whether a clock stands at the film's end. One the hand still holds there does not yet: the
   * hand may carry it back, and what the end offers would come and go under it as it moved.
   */
  const rests = (at: { kind: Transport['kind']; seconds: number }) =>
    at.seconds >= film && at.kind !== 'scrubbing';
  /**
   * The visitor takes the clock: it is set, the drawing follows at once, and it runs on if it
   * plays. Motion the visitor asks for is theirs, so it plays even where motion is unwelcome.
   */
  const take = (next: Transport, standsAtEnd: WindowEnd | null = null) => {
    const replayed = next.kind === 'playing' && next.seconds < film;
    onTake?.(!(still || (done && !replayed) || rests(next)));
    setChosen(true);
    transport.current = next;
    setState({ kind: next.kind, seconds: next.seconds });
    setEnd(standsAtEnd);
    if (replayed) setDone(false);
    const current = scene.current;
    if (!current) return;
    current.paint(next.seconds);
    current.speak();
    current.run();
  };

  return {
    state,
    /** What the drawing last said of the window; nothing once it stands whole. */
    line,
    chosen,
    /** Nothing plays, and the visitor has not asked: the window stands whole. */
    untouched,
    /** The clock runs, as the visitor finds it: never where nothing plays. */
    playing: state.kind === 'playing' && !untouched,
    atEnd: rests(state),
    /** The window stands whole: drawn at once, performed to its end, or brought there by hand. */
    finished: still || done || rests(state),
    /** How it came to stand at its end; none while it does not, or was not brought there. */
    end,
    /**
     * Whether the clock stands at the film's end now, as the visitor finds it: asked at the
     * moment of a key, since the slider's own value says so before the window is first drawn,
     * when the film has yet to begin.
     */
    standsAtEnd: () => rests(found()),
    /** Play and Pause; at the end, play again from the window's first step. */
    playPause: () => {
      const now = found();
      take(now.kind === 'playing' ? pause(now) : play(now, film));
    },
    /**
     * The closest approach, at `seconds` of the film: played slowly from a little before it; at
     * rest on it where motion is unwelcome.
     */
    toClosest: (seconds: number) => take(toClosest(seconds, still)),
    /**
     * The slider: a frame of the Light film, held while the hand is on it. Let go on its last
     * notch, the window stands at its end by the visitor's hand.
     */
    scrub: (filmFrame: number, settled: boolean) => {
      const seconds = filmFrame >= lastNotch ? film : filmFrame / LIGHT_FILM.fps;
      const held = scrub(found(), seconds, film);
      const next = settled ? letGo(held, film) : held;
      take(next, next.kind === 'resting' && next.seconds >= film ? 'hand' : null);
    },
    /** Back at the frame from past it: the recorded window, whole. */
    rest: () => {
      transport.current = restingAt(film, film);
      setState({ kind: 'resting', seconds: film });
      setLine(null);
      setDone(true);
      setEnd('returned');
    },
    /** For the drawing alone: the clock it keeps, and how it reports. */
    forDrawing: {
      transport,
      /** The window is to stand whole, rather than begin or carry on. */
      holdWhole: () => {
        transport.current = restingAt(film, film);
      },
      /** The window as it has just been laid out; none while something else stands on the stage. */
      laid: (next: WindowScene | null) => {
        scene.current = next;
      },
      /** Where the clock stands, and what the line says of it. */
      said: (now: Clock, words: string | null) => {
        setState(now);
        setLine(words);
      },
      /**
       * The clock has run to the window's end, having passed over `leapt` seconds of the film
       * unseen: a second or more was a leap to where the film would be, not the film watched.
       */
      ended: (leapt: number) => {
        setDone(true);
        setEnd(leapt < LATE_SECONDS ? 'played' : 'late');
      },
    },
  };
}
