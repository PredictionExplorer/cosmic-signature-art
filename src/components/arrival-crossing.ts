import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { rungFor, type ArtInterpretation, type Expression } from '@/lib/art/types';
import { bandClip, bandFront, type Field } from '@/lib/crossing/front';
import { FRONT_EDGE, revealAt, revealEnd, spreadPerPlate } from '@/lib/crossing/timing';
import type { SeamController } from './turn';

/*
  The crossing in the order the work was made. Over the plate and its walls, a canvas shows the
  two published stills (or the film the outgoing layer is playing), and a pixel changes from one
  to the other when the work's own order reaches it: Light where its film first drew it, Ink
  where its film came to rest. Every pixel on the plate is a pixel of one of the two, untouched,
  except across the soft edge of the front, where the two are mixed as it passes; only the order
  is the films'. Beyond the
  plate the wall takes the time of the nearest edge, so the room
  follows the work: the running head above and the strip below are walls too, and each of
  their columns turns, through its clip-path, when the same front reaches it.
*/

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uInk, uLight, uMapI, uMapL;
uniform vec4 uArt;
uniform vec2 uCanvas;
uniform vec3 uPaper;
uniform float uReveal, uTowardNight, uEdge, uSpread;

// Beyond the plate a wall takes the time of the nearest edge, averaged along that edge more
// widely the further away it is, so the front leaves the plate as a rounded shape.
float edgeTime(sampler2D map, vec2 qc, float away) {
  if (away <= 0.0) return texture2D(map, qc).r;
  float reach = min(0.3, away * 0.6);
  float sum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float o = float(i) * reach / 4.0;
    sum += texture2D(map, clamp(qc + vec2(o, 0.0), 0.0, 1.0)).r;
    sum += texture2D(map, clamp(qc + vec2(0.0, o), 0.0, 1.0)).r;
  }
  return sum / 18.0;
}

// The front: either side of it each pixel is one of the two stills, untouched; across its soft
// edge the two are mixed as it passes, which also hides the map's eight-bit steps.
float front(float a) {
  return smoothstep(uReveal - uEdge, uReveal + uEdge, a);
}

void main() {
  vec2 q = (vUv - uArt.xy) / uArt.zw;
  vec2 qc = clamp(q, 0.0, 1.0);
  float inside = step(0.0, q.x) * step(0.0, q.y) * step(q.x, 1.0) * step(q.y, 1.0);
  float away = length((q - qc) * uArt.zw * uCanvas) / (uArt.w * uCanvas.y);
  vec3 ink = mix(uPaper, texture2D(uInk, qc).rgb, inside);
  vec3 light = texture2D(uLight, qc).rgb * inside;
  float m;
  if (uTowardNight > 0.5) {
    m = 1.0 - front(edgeTime(uMapL, qc, away) + uSpread * away);
  } else {
    m = front(edgeTime(uMapI, qc, away) + uSpread * away);
  }
  gl_FragColor = vec4(mix(ink, light, m), 1.0);
}`;

type Source = TexImageSource;
type Rect = { x: number; y: number; width: number; height: number };

function load(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}

/** A decoded image this canvas may read: same origin, so the context is never tainted. */
function readable(image: HTMLImageElement | null): image is HTMLImageElement {
  if (!image?.complete || !image.naturalWidth) return false;
  try {
    return new URL(image.currentSrc || image.src, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** A map's bytes for the CPU, read once; null where this browser has no 2D canvas. */
function readField(image: HTMLImageElement): Field | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const data = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
  return { data, width: canvas.width, height: canvas.height };
}

/** `rgb(239, 233, 221)` as 0–1 channels; black when unreadable. */
export function rgb(color: string): [number, number, number] {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  return match
    ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255]
    : [0, 0, 0];
}

export class ArrivalCrossing {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private textures: Record<'ink' | 'light' | 'mapI' | 'mapL', WebGLTexture | null> = {
    ink: null,
    light: null,
    mapI: null,
    mapL: null,
  };
  private stills: Record<Expression, Source | null> = { ink: null, light: null };
  /** The maps on the CPU, for the running head and the strip. */
  private fields: Record<Expression, Field | null> = { ink: null, light: null };
  private ends = { night: 1, paper: 1 };
  private spread = 0;
  private art: Rect = { x: 0, y: 0, width: 1, height: 1 };
  /** This frame's layout in viewport pixels: the work, and the bands beside the plate. */
  private view: { work: DOMRect; head: DOMRect | null; strip: DOMRect | null } | null = null;
  /** Elements whose clip-path the front has taken, given back when the crossing rests. */
  private clipped = new Set<HTMLElement>();
  private preparing: Promise<boolean> | null = null;
  ready = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly container: () => HTMLElement | null,
    private readonly head: () => HTMLElement | null = () =>
      document.querySelector<HTMLElement>('.head-overlay'),
  ) {}

  /**
   * Load both maps and a readable copy of both stills, and compile the program. Resolves false
   * when this browser cannot cross this way (no WebGL, a map or still missing), in which case
   * the straight seam stands.
   */
  prepare(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    this.preparing ??= this.load(ink, light).catch(() => false);
    return this.preparing;
  }

  private async load(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    if (!ink.arrival || !light.arrival) return false;
    // The drawing buffer is kept: a repaint that comes without a new frame (a snapshot, a
    // print, an engine that paints the canvas outside its compositor) shows the last frame
    // painted, never a cleared one.
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return false;
    const container = this.container();
    const wide = Math.min(2, window.devicePixelRatio || 1) * (container?.clientWidth ?? 1280);
    const still = async (interpretation: ArtInterpretation) => {
      // The sharpest image the plate already shows, when this page may read it; the inline
      // preview is never enough, so a smaller one waits for the work's own rung.
      const shown = [
        ...(container?.querySelectorAll<HTMLImageElement>(
          `[data-layer="${interpretation.id}"] .art-media img`,
        ) ?? []),
      ]
        .filter(readable)
        .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
      if (shown && shown.naturalWidth >= Math.min(1280, wide)) return shown;
      const rung = rungFor(interpretation.rungs, Math.min(1920, wide));
      if (!rung) throw new Error('no readable still');
      return load(rung.src);
    };
    const [inkStill, lightStill, mapI, mapL] = await Promise.all([
      still(ink),
      still(light),
      load(ink.arrival.src),
      load(light.arrival.src),
    ]);
    const program = gl.createProgram();
    if (!program) return false;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) return false;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return false;
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.gl = gl;
    this.program = program;
    this.stills = { ink: inkStill, light: lightStill };
    this.textures.ink = this.texture(0, inkStill, false);
    this.textures.light = this.texture(1, lightStill, false);
    this.textures.mapI = this.texture(2, mapI, true);
    this.textures.mapL = this.texture(3, mapL, true);
    this.fields = { ink: readField(mapI), light: readField(mapL) };
    (['uInk', 'uLight', 'uMapI', 'uMapL'] as const).forEach((name, unit) =>
      gl.uniform1i(gl.getUniformLocation(program, name), unit),
    );
    gl.uniform1f(gl.getUniformLocation(program, 'uEdge'), FRONT_EDGE);
    this.spread = spreadPerPlate(light.arrival.spread, light.arrival.width, light.arrival.height);
    this.ready = true;
    return true;
  }

  private texture(unit: number, source: Source, data: boolean) {
    const gl = this.gl!;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      data ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL,
    );
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /**
   * Fit the canvas over the current plate and its walls, and find the work inside it. Returns
   * false when the plate is not laid out (a hidden layer, a collapsed screen).
   */
  private measure(): boolean {
    const container = this.container();
    const gl = this.gl;
    const program = this.program;
    if (!container || !gl || !program) return false;
    const plate = container.querySelector<HTMLElement>('[data-layer="ink"] .plate');
    const media = plate?.querySelector<HTMLElement>('.art-media');
    if (!plate || !media) return false;
    const box = container.getBoundingClientRect();
    const wall = plate.getBoundingClientRect();
    const work = media.getBoundingClientRect();
    if (wall.width < 2 || wall.height < 2 || work.width < 2) return false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(wall.width * ratio);
    const height = Math.round(wall.height * ratio);
    Object.assign(this.canvas.style, {
      left: `${wall.left - box.left}px`,
      top: `${wall.top - box.top}px`,
      width: `${wall.width}px`,
      height: `${wall.height}px`,
    });
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    this.art = {
      x: (work.left - wall.left) * ratio,
      y: (work.top - wall.top) * ratio,
      width: work.width * ratio,
      height: work.height * ratio,
    };
    // The bands beside the plate: the running head's overlay shows only while a Turn travels.
    const overlay = document.documentElement.hasAttribute('data-turning') ? this.head() : null;
    const band = (element?: Element | null) => {
      const box = element?.getBoundingClientRect();
      return box && box.width >= 1 && box.height >= 1 ? box : null;
    };
    const head = band(overlay);
    const strip = band(container.querySelector('[data-layer="ink"] .strip'));
    this.view = { work, head, strip };
    // The reveal ends past the farthest wall, the running head and the strip included.
    const top = Math.min(wall.top, head?.top ?? wall.top);
    const bottom = Math.max(wall.bottom, strip?.bottom ?? wall.bottom);
    const left = Math.min(wall.left, head?.left ?? wall.left, strip?.left ?? wall.left);
    const right = Math.max(wall.right, head?.right ?? wall.right, strip?.right ?? wall.right);
    const end = revealEnd(
      {
        x: (left - wall.left) * ratio,
        y: (top - wall.top) * ratio,
        width: (right - left) * ratio,
        height: (bottom - top) * ratio,
      },
      this.art,
      this.spread,
    );
    this.ends = { night: end, paper: end };
    const screen = plate.closest<HTMLElement>('[data-plate-ground]') ?? plate;
    const [r, g, b] = rgb(getComputedStyle(screen).backgroundColor);
    gl.uniform3f(gl.getUniformLocation(program, 'uPaper'), r, g, b);
    gl.uniform4f(
      gl.getUniformLocation(program, 'uArt'),
      this.art.x / width,
      this.art.y / height,
      this.art.width / width,
      this.art.height / height,
    );
    gl.uniform2f(gl.getUniformLocation(program, 'uCanvas'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'uSpread'), this.spread);
    return true;
  }

  /** The film the outgoing layer is showing, when it is a frame rather than the still. */
  private liveFrame(expression: Expression): HTMLVideoElement | null {
    const video = this.container()?.querySelector<HTMLVideoElement>(
      `[data-layer="${expression}"] .art-media video`,
    );
    if (!video || video.readyState < 2 || video.ended || video.currentTime === 0) return null;
    return getComputedStyle(video).opacity === '0' ? null : video;
  }

  /**
   * Paint the crossing at a seam position: toward night the Light film's order leads, toward
   * paper the Ink film's.
   */
  render(seam: number, toward: 'night' | 'paper') {
    const gl = this.gl;
    const program = this.program;
    if (!this.ready || !gl || !program || !this.measure()) return false;
    const leaving: Expression = toward === 'night' ? 'ink' : 'light';
    const live = this.liveFrame(leaving);
    if (live) {
      try {
        gl.activeTexture(gl.TEXTURE0 + (leaving === 'ink' ? 0 : 1));
        gl.bindTexture(gl.TEXTURE_2D, this.textures[leaving]);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, live);
      } catch {
        /* A frame the canvas may not read stays the still. */
      }
    }
    const reveal = revealAt(seam, toward, this.ends[toward]);
    gl.uniform1f(gl.getUniformLocation(program, 'uReveal'), reveal);
    gl.uniform1f(gl.getUniformLocation(program, 'uTowardNight'), toward === 'night' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.fronts(reveal, toward);
    return true;
  }

  /**
   * The strip and the running head, column by column, in the same frame as the plate. Toward
   * night the front brings Light, so Light lies on the side it has passed; toward paper it
   * brings Ink, so Light lies on the side it has yet to reach. The night layer shows Light;
   * the head's overlay shows its own ground, whichever that is.
   */
  private fronts(reveal: number, toward: 'night' | 'paper') {
    const field = this.fields[toward === 'night' ? 'light' : 'ink'];
    const container = this.container();
    const view = this.view;
    if (!field || !container || !view) return this.release();
    const { work } = view;
    const art = { x: work.left, y: work.top, width: work.width, height: work.height };
    const light = toward === 'night' ? 'near' : 'far';
    const ink = toward === 'night' ? 'far' : 'near';
    const clip = (element: HTMLElement | null, band: DOMRect | null, side: 'near' | 'far') => {
      if (!element || !band) return;
      const front = bandFront(
        field,
        { x: band.left, y: band.top, width: band.width, height: band.height },
        art,
        reveal,
        this.spread,
      );
      const box = element.getBoundingClientRect();
      element.style.transition = 'none';
      element.style.clipPath = bandClip(front, side, { x: box.left, y: box.top });
      this.clipped.add(element);
    };
    clip(container.querySelector<HTMLElement>('[data-layer="light"]'), view.strip, light);
    const root = document.documentElement;
    const to = root.getAttribute('data-turn-to');
    const overlayNight = to ? to === 'night' : root.getAttribute('data-room') === 'paper';
    clip(view.head && this.head(), view.head, overlayNight ? light : ink);
  }

  /** The running head and the strip go back to the seam's own rules. */
  release() {
    this.clipped.forEach((element) => {
      element.style.removeProperty('clip-path');
      element.style.removeProperty('transition');
    });
    this.clipped.clear();
  }

  /** After a crossing the still textures return, ready for the next one. */
  settle() {
    const gl = this.gl;
    if (!gl || !this.ready) return;
    (['ink', 'light'] as const).forEach((expression, unit) => {
      const still = this.stills[expression];
      if (!still) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[expression]);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, still);
    });
  }

  dispose() {
    this.release();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.program = null;
    this.ready = false;
  }
}

/**
 * The crossing for one viewer. Prepared at idle once the plate has settled; while it is ready,
 * <html data-crossing="arrival"> lets the seam take the crossing's longer token. Paints every
 * frame of a Turn (time, peek, finger, Dusk) at the seam's own position, and inside the night
 * wing wherever the hand has drawn the night. The map is the one of the expression not shown:
 * a Turn and its spring-back retrace one order, so nothing jumps when a finger changes its mind.
 */
export function useArrivalCrossing({
  seam,
  ink,
  light,
  expression,
  enabled,
  wingSeam,
}: {
  seam: SeamController;
  ink?: ArtInterpretation;
  light?: ArtInterpretation;
  expression: string;
  /** Both maps are bound and crossings travel (not reduced, paused or hushed). */
  enabled: boolean;
  /** Where the hand has drawn the night in the wing, or null outside it. */
  wingSeam: () => number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const crossing = useRef<ArrivalCrossing | null>(null);
  const toward = useEffectEvent((): 'night' | 'paper' =>
    expression === 'light' ? 'paper' : 'night',
  );
  const drawn = useEffectEvent(() => wingSeam());

  useEffect(() => {
    const node = canvas.current;
    if (!enabled || !node || !ink?.arrival || !light?.arrival) return;
    const instance = new ArrivalCrossing(node, () => node.parentElement);
    crossing.current = instance;
    const root = document.documentElement;
    let cancelled = false;
    const start = () => {
      void instance.prepare(ink, light).then((ok) => {
        if (!cancelled && ok) root.setAttribute('data-crossing', 'arrival');
      });
    };
    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(start, { timeout: 1500 })
        : window.setTimeout(start, 400);
    let frame = 0;
    const hide = () => {
      node.removeAttribute('data-active');
      instance.release();
    };
    const paint = () => {
      frame = 0;
      if (!instance.ready) return hide();
      const turning = root.hasAttribute('data-turning');
      const value = turning ? seam.current() : drawn();
      if (value === null || (!turning && (value <= 0 || value >= 100))) return hide();
      if (instance.render(value, toward())) node.setAttribute('data-active', '');
      else hide();
      if (turning) frame = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const watch = new MutationObserver(() => {
      if (root.hasAttribute('data-turning')) return schedule();
      // The Turn has ended: the seam's own rules take the head and the strip back at once.
      instance.release();
      instance.settle();
      schedule();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['data-turning'] });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number')
        cancelIdleCallback(idle);
      window.clearTimeout(idle as number);
      cancelAnimationFrame(frame);
      watch.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.removeAttribute('data-crossing');
      hide();
      instance.dispose();
      crossing.current = null;
    };
  }, [enabled, ink, light, seam]);

  /** Wait a moment for a crossing still being prepared; a Turn never waits longer. */
  const whenReady = (within: number) => {
    const instance = crossing.current;
    if (!instance || instance.ready || !ink || !light) return Promise.resolve();
    return Promise.race([
      instance.prepare(ink, light).then((ok) => {
        if (ok) document.documentElement.setAttribute('data-crossing', 'arrival');
      }),
      new Promise<void>((resolve) => setTimeout(resolve, within)),
    ]);
  };

  return { canvas: canvas as RefObject<HTMLCanvasElement | null>, whenReady };
}
