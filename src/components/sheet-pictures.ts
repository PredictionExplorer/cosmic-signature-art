/*
  The pictures a sheet is painted from: a work's stills and its arrival maps, read once, for the
  page's crossing (arrival-crossing.ts) and the viewing room's (room-crossing.ts) alike.
*/

/** A still as a canvas takes it: a bitmap where the browser makes one. */
export type Still = ImageBitmap | HTMLImageElement;
export function load(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  return image.decode().then(() => image);
}

/**
 * The still's pixels as they are now: a bitmap where the browser makes one, so a page image
 * that changes its source while the maps arrive cannot change what is uploaded.
 */
export async function snapshot(image: HTMLImageElement, width = 0): Promise<Still> {
  if (typeof createImageBitmap !== 'function') return image;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return image;
  }
  // A still more than twice as wide as the work is painted (in its own pixels, which a
  // responsive image's natural width does not report) is drawn down to the work's width first,
  // finely, as the page draws it. The canvas samples four texels a pixel, so up to twice the
  // width it reads every one; past that it would skip across the finest lines, and the ends of
  // a Turn would not be the still the page shows. On a phone the 1280 rung is over three times
  // the plate; on a desk the 1920 rung is under twice it, and is read as it is.
  if (!(width > 0 && bitmap.width > width * 2)) return bitmap;
  try {
    const fitted = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(width),
      resizeHeight: Math.max(1, Math.round((bitmap.height * width) / bitmap.width)),
      resizeQuality: 'high',
    });
    bitmap.close();
    return fitted;
  } catch {
    return bitmap;
  }
}

export function close(still: Still) {
  if ('close' in still) still.close();
}

/** A decoded image this canvas may read: same origin, so the context is never tainted. */
export function readable(image: HTMLImageElement | null): image is HTMLImageElement {
  if (!image?.complete || !image.naturalWidth) return false;
  try {
    return new URL(image.currentSrc || image.src, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/** A map's bytes, read once; null where this browser has no 2D canvas to read them with. */
export function readMap(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const bytes = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < bytes.length; i++) bytes[i] = rgba[i * 4];
  return { bytes, width: canvas.width, height: canvas.height };
}

/** `rgb(239, 233, 221)` or `#efe9dd` as 0–1 channels; black when unreadable. */
export function rgb(color: string): [number, number, number] {
  const hex = /^\s*#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\s*$/i.exec(color);
  if (hex) return [1, 2, 3].map((i) => parseInt(hex[i], 16) / 255) as [number, number, number];
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color);
  return match
    ? [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255]
    : [0, 0, 0];
}
