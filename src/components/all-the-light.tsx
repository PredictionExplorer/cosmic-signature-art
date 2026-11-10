'use client';

import Link from 'next/link';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cellAt, namesAt, type SkyGrid } from '@/lib/art/sky-names';
import { fill } from '@/lib/i18n/format';
import { SEPARATOR } from '@/lib/typography';
import { useMotion } from './motion-provider';
import styles from './all-the-light.module.css';

/** One work in the sky: its Light still, its numeral and where it leads. */
export interface LightWork {
  id: number;
  cycle: number;
  numeral: string;
  href: string;
  src: string;
  srcSet: string;
}

/** The sky as it stood after one cycle; the last is the whole collection. */
export interface LightSky {
  upTo: number;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  /** The control's word, such as "Cycle 0 to Cycle 1". */
  option: string;
  /** The sky's line, such as "The sky: Cycle 0 to Cycle 1 · 48 works". */
  label: string;
  /** The sky's text alternative: the whole sentence, in the reader's language. */
  alt: string;
}

export interface LightLabels {
  title: string;
  line: string;
  note: string;
  /** The invitation to a pointer, and to a finger, which names by holding. */
  point: string;
  hold: string;
  through: string;
  none: string;
  alone: string;
  back: string;
  visit: string;
  showAlone: string;
  cycles: string;
  replay: string;
  orbits: string;
  /** The word before a cycle's number, such as "Cycle". */
  cycle: string;
  light: string;
}

/**
 * The sky's width as the stylesheet sets it, so a browser fetches the rung it shows: on a wide
 * screen the column beside the index (the page less its gutters, the gap and the index's 22rem),
 * the whole width below that.
 */
const SIZES = '(min-width: 1100px) calc(100vw - 525px), 100vw';
/** Each cycle stands this long in a replay before the next is added. */
const REPLAY_HOLD_MS = 2400;
/** A pointer rests this long before the orbits it names are fetched and lit. */
const NAMING_REST_MS = 120;
/**
 * A finger rests this long on the sky before it names. One lifted sooner is a tap, which chooses
 * at once; one that moves sooner is scrolling the page.
 */
const HOLD_MS = 300;
/** How far a resting finger may wander, in CSS pixels, before it counts as moving. */
const HOLD_SLOP_PX = 10;

/** A finger on the sky: where it came down and where it is, and whether it has rested. */
interface Finger {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  held: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * All the light: every Light still of the collection added as light adds (a derived view, never
 * a work), built offline and kept as the whole sky and as it stood after each cycle. Pointing
 * names the orbits under the pointer and lights them, each as its own still added over the
 * dimmed sky; choosing one leaves it alone, as its own untouched still. A finger has no hover:
 * held on the sky it names what lies beneath it as it moves, and lifting it chooses, while a tap
 * chooses at once. The numerals do the same from the keyboard. The page sums nothing itself and
 * needs no WebGL.
 */
export function AllTheLight({
  works,
  skies,
  grid,
  labels,
}: {
  works: LightWork[];
  skies: LightSky[];
  grid: { src: string; across: number; columns: number; rows: number };
  labels: LightLabels;
}) {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const choice = useRef<HTMLParagraphElement>(null);
  const atlas = useRef<SkyGrid | null>(null);
  const loading = useRef<Promise<boolean> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** The pointer over the sky, or a held finger: whether it is there, and where it last was. */
  const pointer = useRef({ inside: false, x: 0, y: 0, waiting: false });
  const finger = useRef<Finger | null>(null);
  /** A held finger chose as it lifted, so the click its lift may bring is not a tap. */
  const lifted = useRef(false);
  const resting = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The work standing alone, read by the handlers that finish after a fetch. */
  const lone = useRef<number | null>(null);
  /** The latest sky asked for; an earlier one still decoding is not shown after it. */
  const asking = useRef(0);
  /** Chosen from the index: the sky comes up to meet the choice once it is laid out. */
  const reveal = useRef(false);
  /** Focus handed back to a numeral by a hand's return, which names nothing. */
  const quiet = useRef(false);
  const { paused, reducedMotion, theatre } = useMotion();
  const moving = !paused && !reducedMotion && theatre !== 'hushed';
  const whole = skies.length - 1;
  /** The sky on view, and the one the cycle control names, which may still be on its way. */
  const [shown, setShown] = useState(whole);
  const [asked, setAsked] = useState(whole);
  /** Skies whose images have been asked for: the whole sky at once, the others when chosen. */
  const [wanted, setWanted] = useState<ReadonlySet<number>>(() => new Set([whole]));
  const [named, setNamed] = useState<number[]>([]);
  const [alone, setAlone] = useState<number | null>(null);
  /** What the naming line says; null while it invites, a pointer or a finger as the screen has. */
  const [message, setMessage] = useState<string | null>(null);
  const order = useMemo(() => works.map((work) => work.id), [works]);
  const byId = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const inSky = useMemo(
    () => new Set(works.filter((work) => work.cycle <= skies[shown].upTo).map((work) => work.id)),
    [works, skies, shown],
  );

  const stopReplay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (resting.current) clearTimeout(resting.current);
      if (finger.current?.timer) clearTimeout(finger.current.timer);
    },
    [],
  );
  // A replay is motion: Pause, reduced motion or the hush stops it where it stands.
  useEffect(() => {
    if (moving) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, [moving]);

  /** The naming grid, fetched on the first approach and kept; a fetch that fails is tried again. */
  const loadGrid = () => {
    loading.current ??= (async () => {
      const image = new Image();
      image.decoding = 'async';
      image.src = grid.src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(image, 0, 0);
      atlas.current = {
        pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        across: grid.across,
        columns: grid.columns,
        rows: grid.rows,
      };
      return true;
    })().catch(() => {
      loading.current = null;
      return false;
    });
    return loading.current;
  };

  /** The orbits of the sky on view under a point; null while there is no grid to read. */
  const namesUnder = (clientX: number, clientY: number) => {
    const data = atlas.current;
    if (!data) return null;
    const box = frame.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return [];
    const cell = cellAt(data, (clientX - box.left) / box.width, (clientY - box.top) / box.height);
    return cell ? namesAt(data, order, cell.column, cell.row, (id) => inSky.has(id)) : [];
  };
  // A phone's line of names wraps: it may end on a separator, never open with one.
  const numerals = (ids: number[]) => ids.map((id) => byId.get(id)!.numeral).join(SEPARATOR);
  const say = (ids: number[]) =>
    setMessage(ids.length ? fill(labels.through, { works: numerals(ids) }) : labels.none);

  /** Orbits lit over the dimmed sky, each as its own still. */
  const light = (ids: number[]) => {
    if (resting.current) clearTimeout(resting.current);
    resting.current = null;
    setNamed(ids);
  };
  /**
   * What the pointer is over: named at once, lit once the pointer rests there. A finger that has
   * just rested to be held is lit at once.
   */
  const name = (after = NAMING_REST_MS) => {
    if (lone.current !== null || !pointer.current.inside) return;
    const ids = namesUnder(pointer.current.x, pointer.current.y);
    if (ids === null) return;
    say(ids);
    if (!ids.length || !after) return light(ids);
    if (resting.current) clearTimeout(resting.current);
    resting.current = setTimeout(() => light(ids), after);
  };
  /** A numeral names its own orbit, lit at once. */
  const nameFromIndex = (id: number) => {
    if (lone.current !== null) return;
    light([id]);
    setMessage(byId.get(id)!.numeral);
  };
  const rest = () => {
    pointer.current.inside = false;
    if (lone.current !== null) return;
    light([]);
    setMessage(null);
  };
  const choose = (id: number) => {
    stopReplay();
    light([]);
    lone.current = id;
    setAlone(id);
    setMessage(fill(labels.alone, { work: byId.get(id)!.numeral }));
  };
  const chooseFromIndex = (id: number) => {
    reveal.current = true;
    choose(id);
  };
  // A frame after the choice is laid out. The naming line may change its height as it says what
  // was chosen, and WebKit's scroll anchoring, correcting for that, cancels a smooth scroll begun
  // in the same frame.
  useEffect(() => {
    if (alone === null || !reveal.current) return;
    reveal.current = false;
    const behavior: ScrollBehavior = moving ? 'smooth' : 'instant';
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        frame.current?.scrollIntoView({ block: 'nearest', behavior }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [alone, moving]);
  /** The whole sky again. `byHand`: the return was pressed by a pointer or a finger. */
  const back = (byHand = false) => {
    const was = lone.current;
    const focused = was !== null && !!choice.current?.contains(document.activeElement);
    lone.current = null;
    setAlone(null);
    setMessage(null);
    if (!focused) return;
    // The choice's words leave with it: a focus on them returns to the numeral that names it.
    // Pressed by a hand, the page stays where the hand is (on a phone the index lies far below)
    // and the sky comes back whole, its orbit unnamed, as the words promised.
    const numeral = section.current?.querySelector<HTMLElement>(`[data-numeral="${was}"]`);
    quiet.current = byHand;
    numeral?.focus({ preventScroll: byHand });
    quiet.current = false;
  };
  /** A sky is shown once its image is decoded, so a change of sky never passes through black. */
  const showSky = (index: number) => {
    setAsked(index);
    setWanted((current) => (current.has(index) ? current : new Set(current).add(index)));
    const ask = ++asking.current;
    const sky = skies[index];
    const image = new Image();
    image.decoding = 'async';
    image.sizes = SIZES;
    image.srcset = sky.srcSet;
    image.src = sky.src;
    void image
      .decode()
      .catch(() => {})
      .then(() => {
        if (ask === asking.current) setShown(index);
      });
  };
  const pickSky = (index: number) => {
    stopReplay();
    showSky(index);
  };
  /** The sky fills again, cycle by cycle, each held a moment before the next is added. */
  const replay = () => {
    stopReplay();
    back();
    setWanted(new Set(skies.map((_, index) => index)));
    skies.forEach((_, index) => {
      timers.current.push(setTimeout(() => showSky(index), index * REPLAY_HOLD_MS));
    });
  };

  /** The brightest orbit under a point stands alone; where none passes, the sky says so. */
  const chooseAt = (clientX: number, clientY: number) => {
    const ids = namesUnder(clientX, clientY);
    // Without the grid there is nothing to say about the place, not even "none".
    if (ids === null) return;
    if (!ids.length) return say([]);
    choose(ids[0]);
  };
  /** Whether a point lies on the sky as it is laid out. */
  const onSky = (x: number, y: number) => {
    const box = frame.current?.getBoundingClientRect();
    return !!box && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  };

  /** A held finger names what lies beneath it; off the sky, the sky rests until it returns. */
  const follow = (press: Finger, after?: number) => {
    if (lone.current !== null) return;
    const inside = onSky(press.x, press.y);
    Object.assign(pointer.current, { inside, x: press.x, y: press.y });
    if (inside) return name(after);
    light([]);
    setMessage(null);
  };
  /** The finger has rested: from now until it lifts, it names what lies beneath it. */
  const hold = (press: Finger) => {
    if (finger.current !== press) return;
    press.held = true;
    press.timer = null;
    if (atlas.current) return follow(press, 0);
    // The grid is still on its way: the finger names once it has come, wherever it then is.
    void loadGrid().then(() => {
      if (finger.current === press) follow(press, 0);
    });
  };
  /** The finger is no longer the sky's: it scrolled, a second joined it, or the browser took it. */
  const letGo = () => {
    const press = finger.current;
    if (!press) return;
    if (press.timer) clearTimeout(press.timer);
    finger.current = null;
    if (press.held) rest();
  };
  /** A finger came down on the sky: it is held once it has rested there, unless it moves first. */
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    lifted.current = false;
    if (event.pointerType !== 'touch') return;
    // A second finger makes a pinch, the browser's to zoom by: the first names no more.
    if (finger.current) return letGo();
    if (lone.current !== null) return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    const press: Finger = { id, x0: x, y0: y, x, y, held: false, timer: null };
    press.timer = setTimeout(() => hold(press), HOLD_MS);
    finger.current = press;
    void loadGrid();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      const press = finger.current;
      if (!press || press.id !== event.pointerId) return;
      Object.assign(press, { x: event.clientX, y: event.clientY });
      if (press.held) return follow(press);
      // A finger that moves before it has rested is scrolling the page, not naming.
      if (Math.hypot(press.x - press.x0, press.y - press.y0) > HOLD_SLOP_PX) letGo();
      return;
    }
    Object.assign(pointer.current, { inside: true, x: event.clientX, y: event.clientY });
    if (lone.current !== null) return;
    if (atlas.current) return name();
    // Named once the grid has come, wherever the pointer then is, if it is still there.
    if (pointer.current.waiting) return;
    pointer.current.waiting = true;
    void loadGrid().then(() => {
      pointer.current.waiting = false;
      name();
    });
  };
  /** Lifting a held finger chooses the brightest orbit beneath it; lifting it off the sky, none. */
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = finger.current;
    if (!press || press.id !== event.pointerId) return;
    if (press.timer) clearTimeout(press.timer);
    finger.current = null;
    // Lifted before it rested: a tap, and the click that follows chooses at once.
    if (!press.held) return;
    lifted.current = true;
    if (lone.current !== null) return;
    const { clientX, clientY } = event;
    if (!onSky(clientX, clientY)) return rest();
    if (atlas.current) return chooseAt(clientX, clientY);
    void loadGrid().then(() => chooseAt(clientX, clientY));
  };
  const onClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    // A held finger chose as it lifted; the click its lift may bring chooses nothing more.
    if (lifted.current) {
      lifted.current = false;
      return;
    }
    if (lone.current !== null) return back();
    const { clientX, clientY } = event;
    await loadGrid();
    chooseAt(clientX, clientY);
  };

  // A held finger's moves are the sky's, so the page does not scroll beneath it; its lift chose,
  // so no click follows it where the browser lets that be said. React's touch listeners are
  // passive, so these are the frame's own.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const keep = (event: TouchEvent) => {
      if (finger.current?.held && event.cancelable) event.preventDefault();
    };
    const spent = (event: TouchEvent) => {
      if (lifted.current && event.cancelable) event.preventDefault();
    };
    node.addEventListener('touchmove', keep, { passive: false });
    node.addEventListener('touchend', spent, { passive: false });
    return () => {
      node.removeEventListener('touchmove', keep);
      node.removeEventListener('touchend', spent);
    };
  }, []);

  // Escape leaves a work alone for the whole sky again, unless a dialog over the page takes it.
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (document.querySelector('dialog[open]')) return;
    back();
  });
  useEffect(() => {
    if (alone === null) return;
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [alone]);

  const chosen = alone === null ? undefined : byId.get(alone);
  const cycles = [...new Set(works.map((work) => work.cycle))];
  const ratio = skies[whole].width / skies[whole].height;
  return (
    <section ref={section} className={styles.light}>
      <header className={styles.head}>
        <h1 className={styles.title}>{labels.title}</h1>
        <p className={styles.line}>{labels.line}</p>
      </header>
      <figure className={styles.figure}>
        <div
          ref={frame}
          className={styles.frame}
          style={{ '--ratio': ratio } as CSSProperties}
          data-naming={named.length ? '' : undefined}
          data-alone={chosen ? '' : undefined}
          onPointerEnter={() => void loadGrid()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => {
            if (finger.current?.id === event.pointerId) letGo();
          }}
          onPointerLeave={(event) => {
            // A finger leaves as it lifts; its lift, not its leaving, says what comes next.
            if (event.pointerType !== 'touch') rest();
          }}
          onContextMenu={(event) => {
            // A long press opens no menu while a finger is on the sky: a menu would take it away.
            if (finger.current) event.preventDefault();
          }}
          onClick={onClick}
        >
          {skies.map((sky, index) =>
            wanted.has(index) ? (
              <img
                key={sky.upTo}
                className={styles.layer}
                src={sky.src}
                srcSet={sky.srcSet}
                sizes={SIZES}
                width={sky.width}
                height={sky.height}
                alt={index === shown ? sky.alt : ''}
                aria-hidden={index === shown ? undefined : true}
                data-shown={index === shown ? '' : undefined}
                decoding="async"
                fetchPriority={index === whole ? 'high' : undefined}
              />
            ) : null,
          )}
          {named.map((id) => (
            <img
              key={id}
              className={styles.overlay}
              src={byId.get(id)!.src}
              srcSet={byId.get(id)!.srcSet}
              sizes={SIZES}
              alt=""
              decoding="async"
            />
          ))}
          {chosen ? (
            <img
              className={styles.alone}
              src={chosen.src}
              srcSet={chosen.srcSet}
              sizes={SIZES}
              alt={`${chosen.numeral} · ${labels.light}`}
              decoding="async"
            />
          ) : null}
        </div>
        {/* Where the screen is touched the line keeps the finger's invitation's room (data-room)
            while names stand in its place, so its height never changes under a held finger. */}
        <figcaption className={styles.readout} aria-live="polite" data-room={labels.hold}>
          {message === null ? (
            // The invitation speaks to a pointer, or to a finger where the screen is touched.
            <>
              <span className={styles.pointing}>{labels.point}</span>
              <span className={styles.holding}>{labels.hold}</span>
            </>
          ) : (
            <span>{message}</span>
          )}
        </figcaption>
      </figure>
      {/* The choice's words keep their line when nothing is chosen, so choosing moves no more. */}
      <p ref={choice} className={styles.choice}>
        {chosen ? (
          <>
            <Link className={styles.word} href={chosen.href}>
              {fill(labels.visit, { work: chosen.numeral })} →
            </Link>
            <button
              type="button"
              className={styles.word}
              // A click's count is nought from the keyboard, one or more from a hand.
              onClick={(event) => back(event.detail > 0)}
            >
              {labels.back}
            </button>
          </>
        ) : null}
      </p>
      <div className={styles.controls}>
        <div className={styles.cycles} role="group" aria-label={labels.cycles}>
          {skies.map((sky, index) => (
            <button
              key={sky.upTo}
              type="button"
              className={styles.word}
              aria-pressed={index === asked}
              onClick={() => pickSky(index)}
            >
              {sky.option}
            </button>
          ))}
        </div>
        {moving ? (
          <button type="button" className={styles.word} onClick={replay}>
            {labels.replay}
          </button>
        ) : null}
        <p className={styles.state}>{skies[shown].label}</p>
      </div>
      <p className={styles.note}>{labels.note}</p>
      <section className={styles.orbits} aria-labelledby="light-orbits">
        <h2 id="light-orbits" className={styles.heading}>
          {labels.orbits}
        </h2>
        {cycles.map((cycle) => (
          <div key={cycle} className={styles.cycle}>
            <h3 id={`light-cycle-${cycle}`} className={styles.caption}>
              {labels.cycle} {cycle}
            </h3>
            <ol className={styles.numerals} aria-labelledby={`light-cycle-${cycle}`}>
              {works
                .filter((work) => work.cycle === cycle)
                .map((work) => (
                  <li key={work.id}>
                    <button
                      type="button"
                      className={styles.numeral}
                      aria-label={fill(labels.showAlone, { work: work.numeral })}
                      aria-pressed={alone === work.id}
                      data-numeral={work.id}
                      // The orbits of the sky on view are lit; the cycles yet to come wait.
                      data-outside={inSky.has(work.id) ? undefined : ''}
                      // A finger has no hover: lighting the orbit as it lands would change
                      // the page under the tap, and a touch browser would hold back the click.
                      onPointerEnter={(event) => {
                        if (event.pointerType !== 'touch') nameFromIndex(work.id);
                      }}
                      onPointerLeave={rest}
                      onFocus={() => {
                        if (!quiet.current) nameFromIndex(work.id);
                      }}
                      onBlur={rest}
                      onClick={() => (alone === work.id ? back() : chooseFromIndex(work.id))}
                    >
                      {work.numeral}
                    </button>
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </section>
    </section>
  );
}
