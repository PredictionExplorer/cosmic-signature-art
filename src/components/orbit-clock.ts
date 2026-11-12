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
}: {
  /** The Light film's length, in seconds. */
  film: number;
  /** Motion is unwelcome: nothing plays until the visitor asks. */
  still: boolean;
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
   * The visitor takes the clock: it is set, the drawing follows at once, and it runs on if it
   * plays. Motion the visitor asks for is theirs, so it plays even where motion is unwelcome.
   */
  const take = (next: Transport) => {
    setChosen(true);
    transport.current = next;
    setState({ kind: next.kind, seconds: next.seconds });
    if (next.kind === 'playing' && next.seconds < film) setDone(false);
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
    atEnd: state.seconds >= film,
    /** The window stands whole: drawn at once, performed to its end, or brought there by hand. */
    finished: still || done || state.seconds >= film,
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
    /** The slider: a frame of the Light film, held while the hand is on it. */
    scrub: (filmFrame: number, settled: boolean) => {
      const held = scrub(found(), filmFrame / LIGHT_FILM.fps, film);
      take(settled ? letGo(held, film) : held);
    },
    /** Back at the frame from past it: the recorded window, whole. */
    rest: () => {
      transport.current = restingAt(film, film);
      setState({ kind: 'resting', seconds: film });
      setLine(null);
      setDone(true);
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
      /** The clock has run to the window's end. */
      ended: () => setDone(true),
    },
  };
}
