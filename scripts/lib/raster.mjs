/**
 * Decoding and comparing rasters for the derivative pipelines. Images are decoded to 8-bit
 * RGB without colour management, exactly as the publisher's own WebP derivatives are made
 * from the masters, so a comparison measures the pipeline and not a profile conversion.
 */
/** Two expressions are compared at this size: fine enough for a region, blind to codec grain. */
export const COMPARE_WIDTH = 320;
export const COMPARE_HEIGHT = 207;
/** A channel sample departing by more than this is a different mark, not a codec's rounding. */
export const DIFFERENCE_THRESHOLD = 48;

export async function decodeRaw(input, { width, height } = {}) {
  const { default: sharp } = await import('sharp');
  let pipeline = sharp(input, { limitInputPixels: 50_000_000 });
  if (width && height)
    pipeline = pipeline.resize(width, height, { kernel: 'lanczos3', fit: 'fill' });
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * Mean and maximum absolute channel difference between two equally sized rasters, and the
 * share of samples that differ by more than the threshold.
 */
export function meanAbsoluteDifference(a, b, threshold = DIFFERENCE_THRESHOLD) {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels)
    throw new Error('Rasters differ in size');
  if (a.data.length !== b.data.length || a.data.length === 0)
    throw new Error('Rasters differ in length');
  let sum = 0;
  let max = 0;
  let over = 0;
  for (let i = 0; i < a.data.length; i += 1) {
    const difference = Math.abs(a.data[i] - b.data[i]);
    sum += difference;
    if (difference > max) max = difference;
    if (difference > threshold) over += 1;
  }
  return {
    mean: Math.round((sum / a.data.length) * 1000) / 1000,
    max,
    over: Math.round((over / a.data.length) * 100_000) / 100_000,
  };
}

/** Rec. 709 relative luminance of an 8-bit sRGB triple, on the 0–255 scale. */
export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
