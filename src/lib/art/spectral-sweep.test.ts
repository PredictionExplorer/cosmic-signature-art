import { describe, expect, it } from 'vitest';
import {
  RISING_FRAMES,
  SWEEP_FPS,
  SWEEP_FRAMES,
  activeSpan,
  binNm,
  frameForNm,
  frameNm,
  frameTime,
  heldNm,
  legT,
  spectrumAt,
  startingNm,
  sweepCentre,
  sweepReach,
  timeFrame,
  wavelengthRange,
} from './spectral-sweep';

/**
 * The generator's own numbers: CS-Image-Generation's spectral_sweep_motion, copied verbatim
 * into a standalone Rust program and run for four spans (the whole spectrum, two of the
 * collection's narrow bands, and the generator's fallback), printing each frame's wavelength
 * centre with Rust's shortest round-trip formatting. The port reproduces every one of the 600
 * frames of each span to the last bit; these are a sample of them.
 */
const GOLDEN: Record<string, [number, number][]> = {
  '0-63': [
    [0, 382.5],
    [1, 383.5542942062122],
    [2, 384.61013450464753],
    [37, 421.6229462690656],
    [74, 460.0122675055252],
    [111, 500.1541887368451],
    [148, 537.6264077056095],
    [149, 538.6744658422249],
    [150, 539.7268995811879],
    [151, 540.7837150205132],
    [185, 578.0419154536584],
    [222, 616.0378358714667],
    [259, 655.4214758297207],
    [296, 694.3475437163241],
    [297, 695.3968575862498],
    [298, 696.447660726706],
    [299, 697.5],
    [300, 697.5],
    [301, 696.4453158619227],
    [302, 695.3890955910077],
    [337, 658.3887540479215],
    [449, 541.3266121244977],
    [598, 383.55272920515904],
    [599, 382.5],
  ],
  '17-43': [
    [0, 467.5],
    [1, 467.93556510922224],
    [2, 468.3726763106676],
    [37, 483.72996968043685],
    [74, 499.2263143282676],
    [111, 516.4752589709587],
    [148, 531.0545013510945],
    [149, 531.4838303907198],
    [150, 531.917535032693],
    [151, 532.3556213750282],
    [185, 548.5770325105145],
    [222, 563.679976339694],
    [259, 580.1706397093194],
    [296, 596.2037310072941],
    [297, 596.6343157802297],
    [298, 597.066389823696],
    [299, 597.5],
    [300, 597.5],
    [301, 597.0640449589127],
    [302, 596.6265537849877],
    [337, 581.2817306365502],
    [449, 533.5172475760027],
    [598, 467.9340001081691],
    [599, 467.5],
  ],
  '14-28': [
    [0, 452.5],
    [1, 452.73489621290116],
    [2, 452.97133851802545],
    [37, 461.30522051655726],
    [74, 469.3768160005084],
    [111, 479.20101147932],
    [148, 486.35550469557603],
    [149, 486.5841648388804],
    [150, 486.8172005845324],
    [151, 487.05461803054664],
    [185, 496.45328669111655],
    [222, 504.1314813564165],
    [259, 513.1973955621622],
    [296, 521.8057376962573],
    [297, 522.0356535728719],
    [298, 522.2670587200171],
    [299, 522.5],
    [300, 522.5],
    [301, 522.2647138552338],
    [302, 522.0278915776298],
    [337, 513.7064798004297],
    [449, 488.4169131278422],
    [598, 452.733331211848],
    [599, 452.5],
  ],
  '4-59': [
    [0, 402.5],
    [1, 403.42051494199814],
    [2, 404.34257597621945],
    [37, 436.6731134931459],
    [74, 470.11260195368567],
    [111, 505.3046904090859],
    [148, 537.8270766019306],
    [149, 538.7413554743318],
    [150, 539.6600099490809],
    [151, 540.5830461241922],
    [185, 573.2927515740597],
    [222, 606.3388392159483],
    [259, 640.7726463982826],
    [296, 674.7488815089663],
    [297, 675.6644161146779],
    [298, 676.58143999092],
    [299, 677.5],
    [300, 677.5],
    [301, 676.5790951261367],
    [302, 675.6566541194359],
    [337, 643.3385868238411],
    [449, 541.2597224923907],
    [598, 403.41894994094497],
    [599, 402.5],
  ],
};
const spanOf = (key: string) => {
  const [start, end] = key.split('-').map(Number);
  return { start, end };
};
const frames = Array.from({ length: SWEEP_FRAMES }, (_, frame) => frame);

describe('the spectral sweep’s clock, as the generator keeps it', () => {
  it('holds the generator’s wavelength on every sampled frame, to the last bit', () => {
    for (const [key, samples] of Object.entries(GOLDEN)) {
      const span = spanOf(key);
      for (const [frame, nm] of samples) expect(frameNm(frame, span), `${key} @ ${frame}`).toBe(nm);
    }
  });

  it('reads the bins on the generator’s scale: 64 of 5 nm, centred from 382.5 to 697.5 nm', () => {
    expect(binNm(0)).toBe(382.5);
    expect(binNm(63)).toBe(697.5);
    expect(binNm(31) - binNm(30)).toBe(5);
    expect(sweepReach({ start: 14, end: 28 })).toEqual({ from: 452.5, to: 522.5 });
  });

  it('is a ping-pong: up over frames 0–299, down over 300–599, at the span’s ends at the turns', () => {
    for (const key of Object.keys(GOLDEN)) {
      const span = spanOf(key);
      expect(sweepCentre(0, span)).toBe(span.start);
      expect(sweepCentre(RISING_FRAMES - 1, span)).toBe(span.end);
      expect(sweepCentre(RISING_FRAMES, span)).toBe(span.end);
      expect(sweepCentre(SWEEP_FRAMES - 1, span)).toBe(span.start);
      for (const frame of frames) {
        const centre = sweepCentre(frame, span);
        expect(centre).toBeGreaterThanOrEqual(span.start);
        expect(centre).toBeLessThanOrEqual(span.end);
        if (frame > 0 && frame < RISING_FRAMES)
          expect(frameNm(frame, span)).toBeGreaterThan(frameNm(frame - 1, span));
        if (frame > RISING_FRAMES)
          expect(frameNm(frame, span)).toBeLessThan(frameNm(frame - 1, span));
      }
    }
    expect(legT(0)).toBe(0);
    expect(legT(299)).toBe(1);
    expect(legT(300)).toBe(1);
    expect(legT(599)).toBe(0);
  });

  it('visits every bin of its span, as the generator’s own test asks', () => {
    const span = { start: 4, end: 59 };
    const visited = new Set(frames.map((frame) => Math.round(sweepCentre(frame, span))));
    for (let bin = span.start; bin <= span.end; bin += 1) expect(visited.has(bin)).toBe(true);
  });

  it('finds the frame of the first leg that holds a wavelength, and every frame finds itself', () => {
    for (const key of Object.keys(GOLDEN)) {
      const span = spanOf(key);
      for (let frame = 0; frame < RISING_FRAMES; frame += 1)
        expect(frameForNm(frameNm(frame, span), span)).toBe(frame);
    }
    const whole = { start: 0, end: 63 };
    // 540 nm falls between frames 150 (539.73 nm) and 151 (540.78 nm); 150 is nearer.
    expect(frameForNm(540, whole)).toBe(150);
    // Beyond its reach the sweep holds its ends.
    expect(frameForNm(380, whole)).toBe(0);
    expect(frameForNm(700, whole)).toBe(RISING_FRAMES - 1);
    // A narrow band reaches only its own: 043's sweep turns green to blue, never red.
    expect(frameNm(frameForNm(650, { start: 14, end: 28 }), { start: 14, end: 28 })).toBe(522.5);
  });

  it('seeks to the middle of a frame, so the clock’s rounding can never show its neighbour', () => {
    for (const frame of frames) {
      expect(timeFrame(frameTime(frame))).toBe(frame);
      expect(frameTime(frame) * SWEEP_FPS - frame).toBeCloseTo(0.5, 9);
    }
    expect(timeFrame(0)).toBe(0);
    expect(timeFrame(10)).toBe(SWEEP_FRAMES - 1);
    expect(timeFrame(2.5)).toBe(150);
  });

  it('derives a span as active_bin_range does: lit bins widened by two, clamped, or the fallback', () => {
    expect(activeSpan(2, 63)).toEqual({ start: 0, end: 63 });
    expect(activeSpan(0, 61)).toEqual({ start: 0, end: 63 });
    expect(activeSpan(16, 26)).toEqual({ start: 14, end: 28 });
    expect(activeSpan(undefined, undefined)).toEqual({ start: 4, end: 59 });
  });

  it('offers the whole nanometres the sweep reaches, and starts on the work’s own wavelength', () => {
    const whole = { start: 0, end: 63 };
    expect(wavelengthRange(whole)).toEqual({ min: 383, max: 697 });
    expect(wavelengthRange({ start: 14, end: 28 })).toEqual({ min: 453, max: 522 });
    expect(startingNm({ ...whole, dominantNm: 632 })).toBe(632);
    expect(startingNm({ start: 14, end: 28, dominantNm: 632 })).toBe(522);
    expect(startingNm(whole)).toBe(540);
    expect(heldNm(379, whole)).toBe(383);
    expect(heldNm(540.4, whole)).toBe(540);
    expect(spectrumAt(380)).toBe(0);
    expect(spectrumAt(540)).toBe(0.5);
    expect(spectrumAt(720)).toBe(1);
  });
});
