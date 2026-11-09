import type { Field } from '@/lib/crossing/front';
import {
  GROUND_TURN,
  containRect,
  coverLevels,
  frontAt,
  lastMark,
  markWeights,
  maskFrom,
} from '@/lib/crossing/rewind';

/*
  The run back, drawn (src/lib/crossing/rewind.ts). A canvas lies over the still and under the
  film. Where the work has run back past a mark it shows the film's own first frame; where the
  mark still stands it is clear, so the still beneath shows, untouched. Canvas 2D is enough: the
  order is read from the arrival map once, each frame writes the cover into a mask at the map's
  own size, and the browser scales that mask smoothly over the frame, as the crossing's shader
  samples the same map.
*/

/** The canvas never holds more than this many device pixels per CSS pixel. */
const MAX_RATIO = 2;

export interface RunBack {
  /** How long the run back takes, in milliseconds. */
  duration: number;
  /** How the front moves through the marks, a CSS easing as a function. */
  ease: (share: number) => number;
  /** The plate's still, read at the map's size to pace the front by its marks, if it can be. */
  still?: HTMLImageElement | null;
  signal: AbortSignal;
}

export interface Rewind {
  /**
   * Run the still back to the film's current frame: true once the plate shows only that frame,
   * false if stopped first (the canvas is then clear, and the still shows again).
   */
  run(film: HTMLVideoElement, options: RunBack): Promise<boolean>;
  /** Clear the canvas and release its pixels: the still shows again. */
  clear(): void;
}

/** The map's levels, read once on the CPU; null where this browser cannot read them. */
async function readMap(src: string): Promise<Field | null> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const data = new Uint8Array(canvas.width * canvas.height);
  for (let p = 0; p < data.length; p += 1) data[p] = pixels[p * 4];
  return { data, width: canvas.width, height: canvas.height };
}

/**
 * The still at the map's size, as pixels: null until it has decoded, or where the page cannot
 * read it (a still served from another origin), and the front then walks the levels evenly.
 */
function readStill(still: HTMLImageElement, field: Field): Uint8ClampedArray | null {
  if (!still.complete || !still.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = field.width;
  canvas.height = field.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(still, 0, 0, field.width, field.height);
    return context.getImageData(0, 0, field.width, field.height).data;
  } catch {
    return null;
  }
}

/** The film's frame as it stands, held still for the run back; the player itself where it cannot be. */
async function holdFrame(film: HTMLVideoElement): Promise<CanvasImageSource> {
  if (typeof createImageBitmap !== 'function') return film;
  try {
    return await createImageBitmap(film);
  } catch {
    return film;
  }
}

/**
 * The run back for one plate: the canvas it draws on and the arrival map it follows. Null where
 * the browser cannot draw it (no 2D canvas, a map that will not decode or cannot be read); the
 * plate then crosses to its film as before.
 */
export async function prepareRewind(
  canvas: HTMLCanvasElement,
  mapSrc: string,
): Promise<Rewind | null> {
  const field = await readMap(mapSrc);
  const context = canvas.getContext('2d');
  const mask = document.createElement('canvas');
  const masking = mask.getContext('2d');
  if (!field || !context || !masking) return null;
  mask.width = field.width;
  mask.height = field.height;
  return rewindOn(canvas, context, field, mask, masking);
}

function rewindOn(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  field: Field,
  mask: HTMLCanvasElement,
  masking: CanvasRenderingContext2D,
): Rewind {
  const cover = masking.createImageData(field.width, field.height);
  const levels = new Uint8ClampedArray(256);
  /** The marks' weights by level, for the still they were read from. */
  let weighed: { still: string; weights: Float64Array | null } | null = null;
  function weightsOf(still: HTMLImageElement | null | undefined) {
    if (!still) return null;
    const source = still.currentSrc || still.src;
    if (weighed?.still !== source) {
      const pixels = readStill(still, field);
      weighed = { still: source, weights: pixels ? markWeights(field, pixels) : null };
    }
    return weighed.weights;
  }

  function fit() {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(MAX_RATIO, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
  }

  /** One frame of the run: the film's frame, kept only where the work has run back past it. */
  function draw(
    frame: CanvasImageSource,
    size: { width: number; height: number },
    front: number,
    ground: { above: number; share: number },
  ) {
    const { width, height } = canvas;
    maskFrom(field, coverLevels(front, undefined, levels, ground), cover.data);
    masking.putImageData(cover, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, width, height);
    const rect = containRect(size, { width, height });
    context.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
    context.globalCompositeOperation = 'destination-in';
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(mask, 0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }

  function clear() {
    // A zero-sized canvas is clear and holds no pixels until the next run sizes it again.
    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    async run(film, { duration, ease, still, signal }) {
      if (signal.aborted || !film.videoWidth || !film.videoHeight) return false;
      const weights = weightsOf(still);
      const above = lastMark(weights);
      const frame = await holdFrame(film);
      const release = () => {
        if (frame !== film && 'close' in frame) frame.close();
      };
      if (signal.aborted) {
        release();
        return false;
      }
      const size = { width: film.videoWidth, height: film.videoHeight };
      const at = (progress: number) =>
        draw(frame, size, frontAt(ease(progress), weights), {
          above,
          share: progress / GROUND_TURN,
        });
      fit();
      return new Promise<boolean>((resolve) => {
        let request = 0;
        const begin = performance.now();
        const stop = () => {
          cancelAnimationFrame(request);
          release();
          clear();
          resolve(false);
        };
        signal.addEventListener('abort', stop, { once: true });
        const tick = (now: number) => {
          const progress = Math.min(1, Math.max(0, duration > 0 ? (now - begin) / duration : 1));
          at(progress);
          if (progress < 1) {
            request = requestAnimationFrame(tick);
            return;
          }
          signal.removeEventListener('abort', stop);
          release();
          resolve(true);
        };
        // The first frame shows every mark still standing and the still's own sheet: the canvas
        // is clear, the plate unchanged.
        at(0);
        request = requestAnimationFrame(tick);
      });
    },
    clear,
  };
}
