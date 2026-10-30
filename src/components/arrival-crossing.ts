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
uniform sampler2D uInk, uLight, uMapI, uMapL, uFrame;
uniform vec2 uFrameFor;
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
  // The film the outgoing layer is playing stands in for its still: x for Ink, y for Light.
  vec3 frame = texture2D(uFrame, qc).rgb;
  vec3 ink = mix(uPaper, mix(texture2D(uInk, qc).rgb, frame, uFrameFor.x), inside);
  vec3 light = mix(texture2D(uLight, qc).rgb, frame, uFrameFor.y) * inside;
  float m;
  if (uTowardNight > 0.5) {
    m = 1.0 - front(edgeTime(uMapL, qc, away) + uSpread * away);
  } else {
    m = front(edgeTime(uMapI, qc, away) + uSpread * away);
  }
  gl_FragColor = vec4(mix(ink, light, m), 1.0);
}`;

type Still = ImageBitmap | HTMLImageElement;
type Rect = { x: number; y: number; width: number; height: number };
/** How the crossing reads the picture: the order it follows, and the layer it leaves. */
type Reading = { toward: 'night' | 'paper'; leaving: Expression };
const UNIFORMS = [
  'uInk',
  'uLight',
  'uMapI',
  'uMapL',
  'uFrame',
  'uFrameFor',
  'uArt',
  'uCanvas',
  'uPaper',
  'uReveal',
  'uTowardNight',
  'uEdge',
  'uSpread',
] as const;
type Uniform = (typeof UNIFORMS)[number];
/** Texture units, in the order the samplers are bound. */
const UNITS = { ink: 0, light: 1, mapI: 2, mapL: 3, frame: 4 } as const;

function load(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}

/**
 * The still's pixels as they are now: a bitmap where the browser makes one, so a page image
 * that changes its source while the maps arrive cannot change what is uploaded.
 */
async function snapshot(image: HTMLImageElement): Promise<Still> {
  if (typeof createImageBitmap !== 'function') return image;
  try {
    return await createImageBitmap(image);
  } catch {
    return image;
  }
}

function close(still: Still) {
  if ('close' in still) still.close();
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
  private buffer: WebGLBuffer | null = null;
  private uniforms: Partial<Record<Uniform, WebGLUniformLocation | null>> = {};
  private textures: Partial<Record<keyof typeof UNITS, WebGLTexture | null>> = {};
  /** The maps on the CPU, for the running head and the strip. */
  private fields: Record<Expression, Field | null> = { ink: null, light: null };
  private end = 1;
  private spread = 0;
  private art: Rect = { x: 0, y: 0, width: 1, height: 1 };
  /** This frame's layout in viewport pixels: the work, and the bands beside the plate. */
  private view: { work: DOMRect; head: DOMRect | null; strip: DOMRect | null } | null = null;
  /** Elements whose clip-path the front has taken, given back when the crossing rests. */
  private clipped = new Set<HTMLElement>();
  private preparing: Promise<boolean> | null = null;
  /** Each preparation's number: one overtaken by a lost context or a newer one builds nothing. */
  private attempt = 0;
  private disposed = false;
  ready = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly container: () => HTMLElement | null;
  private readonly head: () => HTMLElement | null;
  private readonly onLost: () => void;
  private readonly lost = (event: Event) => {
    // The browser took the context back: stand down now, and be prepared again on its return.
    event.preventDefault();
    this.attempt += 1;
    this.ready = false;
    this.preparing = null;
    this.release();
    this.onLost();
  };
  /** A preparation tried while the context was lost failed for that reason alone. */
  private readonly restored = () => {
    this.preparing = null;
  };

  constructor(
    canvas: HTMLCanvasElement,
    container: () => HTMLElement | null,
    {
      head = () => document.querySelector<HTMLElement>('.head-overlay'),
      onLost = () => {},
    }: { head?: () => HTMLElement | null; onLost?: () => void } = {},
  ) {
    this.canvas = canvas;
    this.container = container;
    this.head = head;
    this.onLost = onLost;
    canvas.addEventListener('webglcontextlost', this.lost);
    canvas.addEventListener('webglcontextrestored', this.restored);
  }

  /**
   * Load both maps and both stills, and compile the program. Resolves false when this browser
   * cannot cross this way (no WebGL, a lost context, a map or still missing), in which case the
   * straight seam stands.
   */
  prepare(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    this.preparing ??= this.load(ink, light).catch(() => false);
    return this.preparing;
  }

  private async load(ink: ArtInterpretation, light: ArtInterpretation): Promise<boolean> {
    if (!ink.arrival || !light.arrival || this.disposed) return false;
    const attempt = ++this.attempt;
    // The drawing buffer is kept: a repaint that comes without a new frame (a snapshot, a
    // print, an engine that paints the canvas outside its compositor) shows the last frame
    // painted, never a cleared one.
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl || gl.isContextLost()) return false;
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
      if (shown && shown.naturalWidth >= Math.min(1280, wide)) return snapshot(shown);
      const rung = rungFor(interpretation.rungs, Math.min(1920, wide));
      if (!rung) throw new Error('no readable still');
      return load(rung.src);
    };
    const stills = [still(ink), still(light)] as const;
    const [inkStill, lightStill, mapI, mapL] = await Promise.all([
      ...stills,
      load(ink.arrival.src),
      load(light.arrival.src),
    ]).catch((failure: unknown) => {
      // A still that did arrive is let go with the rest.
      for (const pending of stills) void pending.then(close, () => {});
      throw failure;
    });
    try {
      // Disposed, lost or overtaken while the images came: nothing is built for no one.
      if (this.disposed || attempt !== this.attempt || gl.isContextLost()) return false;
      if (!this.build(gl)) return false;
      this.textures = {
        ink: this.texture(UNITS.ink, inkStill, false),
        light: this.texture(UNITS.light, lightStill, false),
        mapI: this.texture(UNITS.mapI, mapI, true),
        mapL: this.texture(UNITS.mapL, mapL, true),
        frame: this.texture(UNITS.frame, null, false),
      };
      this.fields = { ink: readField(mapI), light: readField(mapL) };
      gl.uniform1i(this.uniforms.uInk ?? null, UNITS.ink);
      gl.uniform1i(this.uniforms.uLight ?? null, UNITS.light);
      gl.uniform1i(this.uniforms.uMapI ?? null, UNITS.mapI);
      gl.uniform1i(this.uniforms.uMapL ?? null, UNITS.mapL);
      gl.uniform1i(this.uniforms.uFrame ?? null, UNITS.frame);
      gl.uniform1f(this.uniforms.uEdge ?? null, FRONT_EDGE);
      this.spread = spreadPerPlate(light.arrival.spread, light.arrival.width, light.arrival.height);
      this.ready = true;
      return true;
    } finally {
      // Uploaded once: the textures are the crossing's own copies from here on.
      close(inkStill);
      close(lightStill);
    }
  }

  /** Compile and link the program, with its one quad; false when this context refuses it. */
  private build(gl: WebGLRenderingContext): boolean {
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
      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      gl.attachShader(program, shader);
      // The program keeps the compiled code; the shader object itself is no longer needed.
      gl.deleteShader(shader);
      if (!compiled) {
        gl.deleteProgram(program);
        return false;
      }
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return false;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.gl = gl;
    this.program = program;
    this.buffer = buffer;
    // Looked up once: every frame sets its values by these locations.
    this.uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    );
    return true;
  }

  /** A texture on its unit: an image, or (for the film frame) one black pixel until a frame. */
  private texture(unit: number, source: TexImageSource | null, data: boolean) {
    const gl = this.gl!;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
      data ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL,
    );
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]),
      );
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
    if (!container || !gl) return false;
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
    const band = (element?: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect && rect.width >= 1 && rect.height >= 1 ? rect : null;
    };
    // The running head is measured by the header its overlay fills, shown or not, so the head
    // counts the same in the wing as in a Turn and nothing jumps when a Turn begins there.
    const head = band(this.head()?.closest('.site-header'));
    const strip = band(container.querySelector('[data-layer="ink"] .strip'));
    this.view = { work, head, strip };
    // The reveal ends past the farthest wall, the running head and the strip included.
    const top = Math.min(wall.top, head?.top ?? wall.top);
    const bottom = Math.max(wall.bottom, strip?.bottom ?? wall.bottom);
    const left = Math.min(wall.left, head?.left ?? wall.left, strip?.left ?? wall.left);
    const right = Math.max(wall.right, head?.right ?? wall.right, strip?.right ?? wall.right);
    this.end = revealEnd(
      {
        x: (left - wall.left) * ratio,
        y: (top - wall.top) * ratio,
        width: (right - left) * ratio,
        height: (bottom - top) * ratio,
      },
      this.art,
      this.spread,
    );
    const screen = plate.closest<HTMLElement>('[data-plate-ground]') ?? plate;
    const [r, g, b] = rgb(getComputedStyle(screen).backgroundColor);
    const { uniforms } = this;
    gl.uniform3f(uniforms.uPaper ?? null, r, g, b);
    gl.uniform4f(
      uniforms.uArt ?? null,
      this.art.x / width,
      this.art.y / height,
      this.art.width / width,
      this.art.height / height,
    );
    gl.uniform2f(uniforms.uCanvas ?? null, width, height);
    gl.uniform1f(uniforms.uSpread ?? null, this.spread);
    return true;
  }

  /**
   * The frame the outgoing layer's film is showing, uploaded to the frame texture; false when
   * that layer shows its still (or a frame this canvas may not read).
   */
  private frame(expression: Expression): boolean {
    const gl = this.gl;
    const video = this.container()?.querySelector<HTMLVideoElement>(
      `[data-layer="${expression}"] .art-media video`,
    );
    if (!gl || !video || video.readyState < 2 || video.ended || video.currentTime === 0)
      return false;
    if (getComputedStyle(video).opacity === '0') return false;
    try {
      gl.activeTexture(gl.TEXTURE0 + UNITS.frame);
      gl.bindTexture(gl.TEXTURE_2D, this.textures.frame ?? null);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Paint the crossing at a seam position. Toward night Light arrives in the Light film's
   * order; toward paper Ink arrives in the Ink film's. False when it cannot be painted, so the
   * straight seam shows.
   */
  render(seam: number, { toward, leaving }: Reading) {
    const gl = this.gl;
    if (!this.ready || !gl || gl.isContextLost() || !this.measure()) return false;
    const film = this.frame(leaving);
    gl.uniform2f(
      this.uniforms.uFrameFor ?? null,
      film && leaving === 'ink' ? 1 : 0,
      film && leaving === 'light' ? 1 : 0,
    );
    const reveal = revealAt(seam, toward, this.end);
    gl.uniform1f(this.uniforms.uReveal ?? null, reveal);
    gl.uniform1f(this.uniforms.uTowardNight ?? null, toward === 'night' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.fronts(reveal, toward);
    return true;
  }

  /**
   * The strip and the running head, column by column, in the same frame as the plate. Toward
   * night the front brings Light, so Light lies on the side it has passed; toward paper it
   * brings Ink, so Light lies on the side it has yet to reach. The night layer shows Light;
   * the head's overlay shows its own ground, whichever that is, and only while a Turn travels.
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
    if (!root.hasAttribute('data-turning')) return;
    const to = root.getAttribute('data-turn-to');
    const overlayNight = to ? to === 'night' : root.getAttribute('data-room') === 'paper';
    clip(this.head(), view.head, overlayNight ? light : ink);
  }

  /** The running head and the strip go back to the seam's own rules. */
  release() {
    this.clipped.forEach((element) => {
      element.style.removeProperty('clip-path');
      element.style.removeProperty('transition');
    });
    this.clipped.clear();
  }

  /**
   * Release everything this instance made, but keep the context: the canvas outlives the
   * instance, and a context lost on purpose would stay lost for the next one.
   */
  dispose() {
    this.disposed = true;
    this.ready = false;
    this.release();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.canvas.removeEventListener('webglcontextrestored', this.restored);
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      for (const texture of Object.values(this.textures)) if (texture) gl.deleteTexture(texture);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.program = null;
    this.buffer = null;
    this.textures = {};
  }
}

/**
 * The crossing for one viewer. Prepared at idle once the plate has settled; while it is ready,
 * <html data-crossing="arrival"> lets the seam take the crossing's longer token.
 *
 * Each Turn is the crossing's only if it was ready when the Turn began, and it is read once,
 * then: the order it follows and the layer it leaves hold until the Turn ends, so a reversal,
 * a spring-back or the commit itself never switches pictures mid-way. The order is that of the
 * expression arriving: Light's toward the night, Ink's toward the paper, except where Ink rests
 * partly under the night wing, which is drawn in Light's order and so retraced in it. Between
 * Turns, inside the wing, the crossing paints wherever the hand has drawn the night.
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
  /** Where Ink rests inside the night wing (wherever the hand has drawn the night), else null. */
  wingSeam: () => number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const crossing = useRef<ArrivalCrossing | null>(null);
  /** Ink's rest inside the wing while the night is partly drawn there; null otherwise. */
  const partial = useEffectEvent(() => {
    const value = wingSeam();
    return value !== null && value > 0 && value < 100 ? value : null;
  });
  const reading = useEffectEvent((): Reading => {
    const leaving: Expression = expression === 'light' ? 'light' : 'ink';
    return { toward: leaving === 'ink' || partial() !== null ? 'night' : 'paper', leaving };
  });
  /** Between Turns: the wing's night over Ink, the only seam that rests partway. */
  const resting = useEffectEvent(() => (expression === 'light' ? null : partial()));

  useEffect(() => {
    const node = canvas.current;
    if (!enabled || !node || !ink?.arrival || !light?.arrival) return;
    const root = document.documentElement;
    let cancelled = false;
    let frame = 0;
    let turning = root.hasAttribute('data-turning');
    /** The Turn in flight as the crossing reads it; null while it is the straight seam's. */
    let turn: Reading | null = null;
    const hide = () => {
      node.removeAttribute('data-active');
      instance.release();
    };
    const instance = new ArrivalCrossing(node, () => node.parentElement, {
      onLost: () => {
        root.removeAttribute('data-crossing');
        turn = null;
        hide();
      },
    });
    crossing.current = instance;
    const paint = () => {
      frame = 0;
      if (!instance.ready) return hide();
      const value = turning ? turn && seam.current() : resting();
      const shown = value !== null && instance.render(value, turn ?? reading());
      if (shown) node.setAttribute('data-active', '');
      else hide();
      if (turn) frame = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const start = () => {
      void instance.prepare(ink, light).then((ok) => {
        if (cancelled || !ok) return;
        root.setAttribute('data-crossing', 'arrival');
        // Ready inside the wing: draw the night the hand has already drawn.
        schedule();
      });
    };
    // Whichever scheduler took the idle start is the one that may cancel it. Each is called
    // bare: a browser refuses either with any other receiver than the window.
    let cancelIdle: () => void;
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start, { timeout: 1500 });
      cancelIdle = () => cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(start, 400);
      cancelIdle = () => window.clearTimeout(handle);
    }
    const restored = () => {
      if (!cancelled) start();
    };
    node.addEventListener('webglcontextrestored', restored);
    const watch = new MutationObserver(() => {
      const now = root.hasAttribute('data-turning');
      if (now === turning) return;
      turning = now;
      // A Turn begins: the crossing's if it is ready now, read once. A Turn ends: the seam's
      // own rules take the head and the strip back at once.
      turn = now && instance.ready ? reading() : null;
      if (!now) instance.release();
      cancelAnimationFrame(frame);
      frame = 0;
      schedule();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['data-turning'] });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelled = true;
      cancelIdle();
      cancelAnimationFrame(frame);
      watch.disconnect();
      node.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.removeAttribute('data-crossing');
      hide();
      instance.dispose();
      if (crossing.current === instance) crossing.current = null;
    };
  }, [enabled, ink, light, seam]);

  /** Wait a moment for a crossing still being prepared; a Turn never waits longer. */
  const whenReady = (within: number) => {
    const instance = crossing.current;
    if (!instance || instance.ready || !ink || !light) return Promise.resolve();
    return Promise.race([
      instance.prepare(ink, light).then((ok) => {
        // Only the instance still in place may mark the page: a disposed one may still resolve.
        if (ok && crossing.current === instance)
          document.documentElement.setAttribute('data-crossing', 'arrival');
      }),
      new Promise<void>((resolve) => setTimeout(resolve, within)),
    ]);
  };

  return { canvas: canvas as RefObject<HTMLCanvasElement | null>, whenReady };
}
