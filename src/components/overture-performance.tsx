'use client';
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { WindowPerformance, type OrbitWindow, type PlanePoints } from '@/lib/physics/orbit';
import { lightFilmDuration, stepsDrawnAt } from '@/lib/physics/light-film';
import {
  overtureLayout,
  overtureShare,
  plateTransform,
  revealAtShare,
  type Box,
} from '@/lib/overture';
import { rungFor, type StillRung } from '@/lib/art/types';
import { OVERTURE_KEY } from '@/lib/storage-keys';
import { Condensation } from './overture-condensation';
import { setOverturePhase, useOverturePhase } from './overture-store';
import { useMotion } from './motion-provider';
import { tokenMs } from './turn';
import styles from './overture.module.css';

/** The day's work as the Overture performs it: its recorded window and its Light still. */
export interface OvertureWork {
  window: OrbitWindow;
  bodyHues: readonly [number, number, number];
  /** The Light still's ladder, ascending by width, and its arrival map. */
  rungs: readonly StillRung[];
  arrival: string;
}

/** Every hundredth step is drawn, as the orbit section draws it. */
const STRIDE = 100;
/** The trails come up over the first second; the bodies are there from the first frame. */
const TRAILS_IN_MS = 1000;
/** No still is worth more than this many pixels across. */
const WIDEST = 2048;
/** Input that ends the Overture at once, besides the keys: the hand, the wheel, a scroll. */
const MOVES = ['pointerdown', 'touchstart', 'wheel', 'scroll'] as const;

/** Swallows the click a press makes, should it come within the press's own moment. */
function swallowClick() {
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 600);
}

function decoded(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}

const boxOf = (rect: DOMRect): Box => ({
  x: rect.left,
  y: rect.top,
  width: rect.width,
  height: rect.height,
});

/**
 * The Overture, performed (third-physics.md §5.8). Over the black of the first paint the day's
 * work's three bodies run their recorded window, replayed from its verified first step, while
 * beside them the Light still condenses in its arrival order, on one clock: when the score has
 * drawn a share of the window the still has come to the same share of its order. The plate then
 * grows into its place on the home, the black lifts over the home's own Light plate, and the
 * plate lands on the expression the home opens on (artwork-viewer.tsx); the running head comes
 * last. Any input ends it at once, on the page as it would have opened.
 */
export default function OverturePerformance({
  work,
  onEnd,
}: {
  work: OvertureWork;
  onEnd: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLDivElement>(null);
  const trails = useRef<HTMLCanvasElement>(null);
  const lights = useRef<HTMLCanvasElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLImageElement>(null);
  /** Ends the Overture at once, wherever it stands; set while it plays. */
  const interrupt = useRef<() => void>(() => {});
  const phase = useOverturePhase();
  const { paused, reducedMotion } = useMotion();
  const ended = useEffectEvent(() => onEnd());

  /* The performance itself, from the props it was mounted with: it is performed once. */
  const perform = useEffectEvent((): (() => void) => {
    const html = document.documentElement;
    const parts = [root, score, trails, lights, plate, still, fallback].map((ref) => ref.current);
    const [overlay, scoreBox, trailCanvas, lightCanvas, plateBox, stillCanvas, image] = parts as [
      HTMLDivElement,
      HTMLDivElement,
      HTMLCanvasElement,
      HTMLCanvasElement,
      HTMLDivElement,
      HTMLCanvasElement,
      HTMLImageElement,
    ];
    let frame = 0;
    let timer = 0;
    let wait = 0;
    /** Ended: by input, by a failure, or by nothing left to perform. */
    let over = false;
    /** The black has lifted over the home: input now acts on the page as well as ending this. */
    let lifted = false;
    /** Taken down (a remount, the page left): whatever was still on its way builds nothing. */
    let cancelled = false;
    let condensation: Condensation | null = null;
    const width0 = innerWidth;
    const waitMs = tokenMs(html, '--t-overture-wait', 4000);
    const listening = { capture: true, passive: true } as const;
    const stop = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(wait);
      for (const name of MOVES) window.removeEventListener(name, moved, listening);
      window.removeEventListener('keydown', keyed, { capture: true });
      window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', hidden);
      condensation?.dispose();
      condensation = null;
    };
    /** The page as it would have opened, at once: the plate in its opening, the head with it. */
    function interruptNow() {
      if (over) return;
      over = true;
      stop();
      setOverturePhase('done');
      html.removeAttribute('data-overture');
      ended();
    }
    // While the black is up the input that ends the Overture does nothing else: the press is not
    // also a press on what lay beneath, and the key is not also a key for the plate.
    function moved(event: Event) {
      if (!lifted && (event.type === 'pointerdown' || event.type === 'touchstart')) swallowClick();
      interruptNow();
    }
    function keyed(event: KeyboardEvent) {
      if (!lifted && event.key !== 'Tab') {
        event.preventDefault();
        event.stopPropagation();
      }
      interruptNow();
    }
    function hidden() {
      if (document.visibilityState === 'hidden') interruptNow();
    }
    // A phone's toolbar changes the height as it settles; a new width is a new layout.
    function resized() {
      if (innerWidth !== width0) interruptNow();
    }
    interrupt.current = interruptNow;

    // The home as the visitor will meet it: its plate's art, laid out at the top of the page.
    const art = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-presentation="home"] [data-layer] .art-media',
      ),
    ]
      .map((node) => boxOf(node.getBoundingClientRect()))
      .find((box) => box.width > 1 && box.height > 1);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rung = art && rungFor([...work.rungs], Math.min(WIDEST, art.width * ratio));
    const trail = trailCanvas.getContext('2d');
    const light = lightCanvas.getContext('2d');
    // Nothing to perform, a page already moved, or a black that has lifted itself already
    // (globals.css, after --t-overture-wait): the page stands as it would have opened.
    if (!art || !rung || !trail || !light || window.scrollY > 0 || performance.now() >= waitMs) {
      interruptNow();
      return stop;
    }
    // From here the Overture is this browser's: it is not offered again.
    try {
      localStorage.setItem(OVERTURE_KEY, 'seen');
    } catch {
      /* Storage is optional; the first paint stands aside when it cannot be read. */
    }
    html.setAttribute('data-overture', 'playing');
    setOverturePhase('playing');

    const gutter = parseFloat(getComputedStyle(html).getPropertyValue('--gutter')) || 20;
    const layout = overtureLayout({ width: innerWidth, height: innerHeight }, art, gutter);
    const place = (node: HTMLElement, box: Box) =>
      Object.assign(node.style, {
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
    // The plate is laid out in its own place and only ever scaled down, so it lands sharp.
    place(plateBox, art);
    plateBox.style.transform = plateTransform(art, layout.plate);
    place(scoreBox, layout.score);
    overlay.setAttribute('data-arrangement', layout.arrangement);
    stillCanvas.width = Math.round(art.width * ratio);
    stillCanvas.height = Math.round(art.height * ratio);
    for (const canvas of [trailCanvas, lightCanvas]) {
      canvas.width = Math.round(layout.score.width * ratio);
      canvas.height = Math.round(layout.score.height * ratio);
    }

    // The score: the window's plane fitted to its box, as the orbit section fits it.
    const [u0, u1, v0, v1] = work.window.plane.bounds;
    const width = trailCanvas.width;
    const height = trailCanvas.height;
    const margin = 0.06 * Math.min(width, height);
    const scale = Math.min(
      (width - 2 * margin) / (u1 - u0 || 1),
      (height - 2 * margin) / (v1 - v0 || 1),
    );
    const ox = (width - (u1 - u0) * scale) / 2 - u0 * scale;
    const oy = (height - (v1 - v0) * scale) / 2 - v0 * scale;
    const hues = work.bodyHues;
    const radius = work.window.masses.map((mass) => Math.cbrt(mass) * 0.6 * ratio);
    const replay = new WindowPerformance(work.window);
    const steps = work.window.steps;
    const film = lightFilmDuration(steps);
    const point: PlanePoints = { u: new Float64Array(3), v: new Float64Array(3) };
    const here = (): [number, number][] => {
      replay.project(point);
      return [0, 1, 2].map((body) => [ox + point.u[body] * scale, oy + point.v[body] * scale]);
    };
    /** Where each body was last drawn, so each frame's path continues the one before. */
    let last = here();
    const glows = () => {
      light.clearRect(0, 0, width, height);
      for (let body = 0; body < 3; body++) {
        const [cx, cy] = last[body];
        const reach = radius[body] * 4;
        const glow = light.createRadialGradient(cx, cy, 0, cx, cy, reach);
        glow.addColorStop(0, `oklch(0.96 0.04 ${hues[body]})`);
        glow.addColorStop(0.22, `oklch(0.9 0.08 ${hues[body]} / 0.55)`);
        glow.addColorStop(1, 'transparent');
        light.fillStyle = glow;
        light.beginPath();
        light.arc(cx, cy, reach, 0, Math.PI * 2);
        light.fill();
      }
    };
    glows();
    trail.globalCompositeOperation = 'lighter';
    trail.lineWidth = ratio;
    trail.lineJoin = 'round';
    /** The window drawn on to `target`: a path a body a frame, light added as the film adds it. */
    const drawTo = (target: number) => {
      const paths = last.map((place) => [place]);
      replay.run(target, STRIDE, () => {
        const places = here();
        for (let body = 0; body < 3; body++) paths[body].push(places[body]);
      });
      last = here();
      for (let body = 0; body < 3; body++) {
        paths[body].push(last[body]);
        trail.strokeStyle = `oklch(0.84 0.075 ${hues[body]} / 0.2)`;
        trail.beginPath();
        trail.moveTo(...paths[body][0]);
        for (let index = 1; index < paths[body].length; index++)
          trail.lineTo(...paths[body][index]);
        trail.stroke();
      }
      glows();
    };

    const performMs = tokenMs(html, '--t-overture', 6500);
    const landMs = tokenMs(html, '--t-overture-land', 1200);
    /** One clock for the score and the still, from the first frame after both are ready. */
    const begin = (reveal: (share: number) => void) => {
      let start: number | null = null;
      const tick = (now: number) => {
        start ??= now;
        const elapsed = now - start;
        const share = overtureShare(elapsed, performMs);
        trailCanvas.style.opacity = String(Math.min(1, elapsed / TRAILS_IN_MS));
        drawTo(stepsDrawnAt(share * film, steps));
        reveal(share);
        if (share < 1) frame = requestAnimationFrame(tick);
        else land();
      };
      trailCanvas.style.opacity = '0';
      frame = requestAnimationFrame(tick);
    };
    /** The score gives way and the plate grows into its place; then the black lifts. */
    const land = () => {
      overlay.setAttribute('data-landing', '');
      plateBox.style.transform = 'none';
      timer = window.setTimeout(() => {
        lifted = true;
        html.setAttribute('data-overture', 'landing');
        setOverturePhase('landing');
        // The home's own plate is beneath, the same still in the same place: once it has
        // painted, this one gives way to it.
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            overlay.setAttribute('data-gone', '');
            condensation?.dispose();
            condensation = null;
          });
        });
      }, landMs);
    };

    // The still and its order; where they cannot be had in time, the page at once.
    wait = window.setTimeout(interruptNow, waitMs);
    void Promise.all([decoded(rung.src), decoded(work.arrival)])
      .then(([picture, map]) => {
        clearTimeout(wait);
        if (over || cancelled) return;
        const drawn = new Condensation(stillCanvas);
        if (drawn.prepare(picture, map)) {
          condensation = drawn;
          drawn.draw(revealAtShare(0));
          begin((share) => condensation?.draw(revealAtShare(share)));
          return;
        }
        // No WebGL here: the still comes up whole, on the same clock.
        drawn.dispose();
        stillCanvas.hidden = true;
        image.src = picture.src;
        image.style.opacity = '0';
        image.hidden = false;
        begin((share) => {
          image.style.opacity = String(share);
        });
      })
      .catch(() => {
        if (!cancelled) interruptNow();
      });

    // Listening last, once nothing above can throw and leave a listener behind.
    for (const name of MOVES) window.addEventListener(name, moved, listening);
    window.addEventListener('keydown', keyed, { capture: true });
    window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelled = true;
      stop();
      // Taken down while it plays (the page left; or development, which mounts it again at
      // once and takes it up afresh): the page stands as it would have opened.
      if (!over) {
        setOverturePhase('done');
        if (html.getAttribute('data-overture') !== 'dawn') html.removeAttribute('data-overture');
      }
    };
  });
  useLayoutEffect(() => perform(), []);

  // Pause or reduced motion asked for while it plays ends it, as any input does.
  const holdStill = useEffectEvent(() => interrupt.current());
  useEffect(() => {
    if (paused || reducedMotion) holdStill();
  }, [paused, reducedMotion]);

  // Landed: the head and the strip arrive last, over --t-dawn, and the Overture is over.
  useEffect(() => {
    if (phase !== 'done') return;
    const html = document.documentElement;
    if (html.getAttribute('data-overture') !== 'landing') return;
    html.setAttribute('data-overture', 'dawn');
    const timer = window.setTimeout(
      () => {
        html.removeAttribute('data-overture');
        ended();
      },
      tokenMs(html, '--t-dawn', 2000),
    );
    return () => {
      clearTimeout(timer);
      // Taken away mid-dawn, the head is let stand.
      if (html.getAttribute('data-overture') === 'dawn') html.removeAttribute('data-overture');
    };
  }, [phase]);

  return (
    <div ref={root} className={styles.overture} aria-hidden="true">
      <div ref={score} className={styles.score}>
        <canvas ref={trails} className={styles.layer} />
        <canvas ref={lights} className={styles.layer} />
      </div>
      <div ref={plate} className={styles.plate}>
        <canvas ref={still} className={styles.layer} />
        <img ref={fallback} className={styles.layer} alt="" hidden />
      </div>
    </div>
  );
}
