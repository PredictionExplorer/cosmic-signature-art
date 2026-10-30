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
import { useMotion } from './motion-provider';
import { lendPlateTone, returnPlateTone } from './room-ground';
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
  point: string;
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
 * All the light: every Light still of the collection added as light adds (a derived view, never
 * a work), built offline and kept as the whole sky and as it stood after each cycle. Pointing
 * names the orbits under the pointer and lights them, each as its own still added over the
 * dimmed sky; choosing one leaves it alone, as its own untouched still. The numerals do the
 * same from the keyboard. The page sums nothing itself and needs no WebGL.
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
  /** The pointer over the sky: whether it is there, and where it last was. */
  const pointer = useRef({ inside: false, x: 0, y: 0, waiting: false });
  const resting = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The work standing alone, read by the handlers that finish after a fetch. */
  const lone = useRef<number | null>(null);
  /** The latest sky asked for; an earlier one still decoding is not shown after it. */
  const asking = useRef(0);
  /** Chosen from the index: the sky comes up to meet the choice once it is laid out. */
  const reveal = useRef(false);
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
  const [message, setMessage] = useState(labels.point);
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
  const numerals = (ids: number[]) => ids.map((id) => byId.get(id)!.numeral).join(' · ');
  const say = (ids: number[]) =>
    setMessage(ids.length ? fill(labels.through, { works: numerals(ids) }) : labels.none);

  /** Orbits lit over the dimmed sky, each as its own still. */
  const light = (ids: number[]) => {
    if (resting.current) clearTimeout(resting.current);
    resting.current = null;
    setNamed(ids);
  };
  /** What the pointer is over: named at once, lit once the pointer rests there. */
  const name = () => {
    if (lone.current !== null || !pointer.current.inside) return;
    const ids = namesUnder(pointer.current.x, pointer.current.y);
    if (ids === null) return;
    say(ids);
    if (!ids.length) return light([]);
    if (resting.current) clearTimeout(resting.current);
    resting.current = setTimeout(() => light(ids), NAMING_REST_MS);
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
    setMessage(labels.point);
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
  const back = () => {
    const was = lone.current;
    const focused = was !== null && !!choice.current?.contains(document.activeElement);
    lone.current = null;
    setAlone(null);
    setMessage(labels.point);
    // The choice's words leave with it: a focus on them returns to the numeral that names it.
    if (focused) section.current?.querySelector<HTMLElement>(`[data-numeral="${was}"]`)?.focus();
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

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
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
  const onClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (lone.current !== null) return back();
    const { clientX, clientY } = event;
    await loadGrid();
    const ids = namesUnder(clientX, clientY);
    // Without the grid there is nothing to say about the place, not even "none".
    if (ids === null) return;
    if (!ids.length) return say([]);
    choose(ids[0]);
  };

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

  // The page is night from the top: while it stands beneath the running head, the head is too.
  useEffect(() => {
    const node = section.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const holder = {};
    const head = new IntersectionObserver(
      ([entry]) =>
        entry.isIntersecting ? lendPlateTone(holder, '#000000', 'night') : returnPlateTone(holder),
      { rootMargin: '-2px 0px -92% 0px' },
    );
    head.observe(node);
    return () => {
      head.disconnect();
      returnPlateTone(holder);
    };
  }, []);

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
          onPointerMove={onPointerMove}
          onPointerLeave={rest}
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
        <figcaption className={styles.readout} aria-live="polite">
          {message}
        </figcaption>
      </figure>
      {/* The choice's words keep their line when nothing is chosen, so choosing moves no more. */}
      <p ref={choice} className={styles.choice}>
        {chosen ? (
          <>
            <Link className={styles.word} href={chosen.href}>
              {fill(labels.visit, { work: chosen.numeral })} →
            </Link>
            <button type="button" className={styles.word} onClick={back}>
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
                      onFocus={() => nameFromIndex(work.id)}
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
