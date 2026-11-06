import { describe, expect, it } from 'vitest';
import { bindFigures, bindNumbers, NBSP, SEPARATOR, unbroken, withUnit } from './typography';

describe('composed lines', () => {
  it('lets a line end on the separator but never open with it', () => {
    expect(SEPARATOR).toBe('\u00a0· ');
    expect(['72 works', 'since June 2026'].join(SEPARATOR)).toBe('72 works\u00a0· since June 2026');
  });

  it('binds a quantity to its unit and keeps a clock whole', () => {
    expect(withUnit('116', 's')).toBe(`116${NBSP}s`);
    expect(unbroken('11:15\u202fPM UTC')).toBe('11:15\u00a0PM\u00a0UTC');
  });

  it('keeps a figure with the word it counts or names', () => {
    expect(bindFigures('Cycle 0 to Cycle 2')).toBe('Cycle\u00a00\u00a0to Cycle\u00a02');
    expect(bindFigures('72 works')).toBe('72\u00a0works');
    expect(bindFigures('since June 2026')).toBe('since June\u00a02026');
    expect(bindFigures('A living collection of recorded orbits')).toBe(
      'A living collection of recorded orbits',
    );
  });

  it('binds the numbers in a catalog sentence and leaves its words alone', () => {
    expect(bindNumbers('derivatives of 16-bit masters, 3,456 × 2,234 px.')).toBe(
      'derivatives of 16-bit masters, 3,456\u00a0×\u00a02,234\u00a0px.',
    );
    // Ukrainian groups thousands with a space; the group never breaks.
    expect(bindNumbers('майстер-файлів, 3 456 × 2 234 px.')).toBe(
      'майстер-файлів, 3\u00a0456\u00a0×\u00a02\u00a0234\u00a0px.',
    );
    expect(bindNumbers('Films are H.264 derivatives of 60 fps renders.')).toBe(
      'Films are H.264 derivatives of 60\u00a0fps renders.',
    );
    expect(bindNumbers('bản gốc 16 bit, 380 to 700 nm')).toBe(
      'bản gốc 16\u00a0bit, 380 to 700\u00a0nm',
    );
    // A year beside a count is not a digit group.
    expect(bindNumbers('since 2026 72 works')).toBe('since 2026 72 works');
  });
});
