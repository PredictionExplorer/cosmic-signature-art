/**
 * The spectral sweep's clock, ported from the generator that renders it
 * (CS-Image-Generation: `spectral_sweep_motion` and its helpers in
 * src/render/spectral_output.rs, the constants in src/render/constants.rs, the bins in
 * src/spectrum.rs). Safe to import from client components.
 *
 * The published sweep is 600 frames at 60 fps, a ping-pong over the work's own span of the 64
 * five-nanometre bins: frames 0–299 carry the wavelength up from the span's first bin to its last
 * in equal steps, frames 300–599 bring it back. A small vibrato (±0.16 bin, seven cycles across
 * the film, gated to nothing at either end of a leg) rides on the climb, and the result is
 * clamped to the span. The frame's wavelength is its centre bin read on the bins' own scale:
 * bin b is centred on 380 + (b + ½) × 5 nm. The span is the work's, not a constant: the
 * generator sweeps only the bins its render put light in (src/lib/art/sweep-spans.ts).
 */
import type { SweepSpan } from './types';

/** CYCLE_TOTAL_FRAMES: ten seconds at DEFAULT_VIDEO_FPS. */
export const SWEEP_FRAMES = 600;
export const SWEEP_FPS = 60;
/** The generator's spectrum: NUM_BINS bins from LAMBDA_START to LAMBDA_END. */
export const SPECTRUM_FROM_NM = 380;
export const SPECTRUM_TO_NM = 700;
export const SPECTRUM_BINS = 64;
/** SWEEP_CENTER_VIBRATO_BINS and SWEEP_CENTER_VIBRATO_CYCLES. */
const VIBRATO_BINS = 0.16;
const VIBRATO_CYCLES = 7;
const TAU = 2 * Math.PI;
/** The first leg, violet to red: the frames the lens holds. */
export const RISING_FRAMES = Math.max(Math.floor(SWEEP_FRAMES / 2), 2);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** wavelength_nm_for_bin: the centre of a bin, in nanometres, in the generator's own order of operations. */
export function binNm(bin: number): number {
  return SPECTRUM_FROM_NM + ((bin + 0.5) * (SPECTRUM_TO_NM - SPECTRUM_FROM_NM)) / SPECTRUM_BINS;
}

/** spectral_sweep_leg_t: how far along its leg a frame is, 0 at either end of the film. */
export function legT(frame: number): number {
  const at = Math.min(frame, SWEEP_FRAMES - 1);
  const denominator = RISING_FRAMES - 1;
  return clamp(at < RISING_FRAMES ? at / denominator : (SWEEP_FRAMES - 1 - at) / denominator, 0, 1);
}

/** The centre of a frame, in bins: spectral_sweep_motion's `center`. */
export function sweepCentre(frame: number, span: SweepSpan): number {
  const t = legT(frame);
  const base = span.start + t * (span.end - span.start);
  const phase = Math.min(frame, SWEEP_FRAMES - 1) / (SWEEP_FRAMES - 1);
  const gate = clamp(t * (1 - t) * 4, 0, 1);
  const vibrato = Math.sin(phase * TAU * VIBRATO_CYCLES) * VIBRATO_BINS * gate;
  return clamp(base + vibrato, Math.min(span.start, span.end), Math.max(span.start, span.end));
}

/** A fractional bin read as a wavelength, as interpolated_wavelength_tint reads it. */
export function centreNm(centre: number): number {
  const at = clamp(centre, 0, SPECTRUM_BINS - 1);
  const low = Math.floor(at);
  const high = Math.min(low + 1, SPECTRUM_BINS - 1);
  return binNm(low) + (binNm(high) - binNm(low)) * (at - low);
}

/** The wavelength a frame of the sweep holds, in nanometres. */
export function frameNm(frame: number, span: SweepSpan): number {
  return centreNm(sweepCentre(frame, span));
}

/** The wavelengths the sweep reaches: its span's first and last bin centres. */
export function sweepReach(span: SweepSpan): { from: number; to: number } {
  return { from: binNm(Math.min(span.start, span.end)), to: binNm(Math.max(span.start, span.end)) };
}

/** The whole nanometres a visitor may choose: those inside the sweep's reach. */
export function wavelengthRange(span: SweepSpan): { min: number; max: number } {
  const { from, to } = sweepReach(span);
  return { min: Math.ceil(from), max: Math.floor(to) };
}

/** A wavelength kept inside what the sweep holds, in whole nanometres. */
export function heldNm(nm: number, span: SweepSpan): number {
  const { min, max } = wavelengthRange(span);
  return clamp(Math.round(nm), min, max);
}

/** Where a lens first holds a sweep: the work's own dominant wavelength, or the middle of its reach. */
export function startingNm(span: SweepSpan): number {
  const { min, max } = wavelengthRange(span);
  return heldNm(span.dominantNm ?? (min + max) / 2, span);
}

const rising = new Map<string, number[]>();
/** The first leg's wavelengths, one per frame, computed once per span. */
function risingNm(span: SweepSpan): number[] {
  const key = `${span.start}:${span.end}`;
  let table = rising.get(key);
  if (!table) {
    table = Array.from({ length: RISING_FRAMES }, (_, frame) => frameNm(frame, span));
    rising.set(key, table);
  }
  return table;
}

/** The frame of the first leg that holds the wavelength closest to `nm`; the earliest on a tie. */
export function frameForNm(nm: number, span: SweepSpan): number {
  const table = risingNm(span);
  let best = 0;
  for (let frame = 1; frame < table.length; frame += 1) {
    if (Math.abs(table[frame] - nm) < Math.abs(table[best] - nm)) best = frame;
  }
  return best;
}

/** A frame's middle, in seconds: a seek here lands on that frame whatever the clock's rounding. */
export function frameTime(frame: number): number {
  return (clamp(Math.round(frame), 0, SWEEP_FRAMES - 1) + 0.5) / SWEEP_FPS;
}

/** The frame on screen at a film time. */
export function timeFrame(seconds: number): number {
  return clamp(Math.floor(seconds * SWEEP_FPS), 0, SWEEP_FRAMES - 1);
}

/**
 * BinBuffers::active_bin_range: the first and last bins with light, each widened by two and
 * clamped to the spectrum; SWEEP_BIN_START..=SWEEP_BIN_END when no bin has light.
 */
export function activeSpan(firstLit: number | undefined, lastLit: number | undefined): SweepSpan {
  if (firstLit === undefined || lastLit === undefined) return { start: 4, end: 59 };
  return { start: Math.max(0, firstLit - 2), end: Math.min(SPECTRUM_BINS - 1, lastLit + 2) };
}

/** Where a wavelength falls along the visible spectrum, 0 at 380 nm and 1 at 700 nm. */
export function spectrumAt(nm: number): number {
  return clamp((nm - SPECTRUM_FROM_NM) / (SPECTRUM_TO_NM - SPECTRUM_FROM_NM), 0, 1);
}
