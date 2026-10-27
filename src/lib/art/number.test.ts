import { describe, expect, it } from 'vitest';
import { workFolio, workNumber } from './number';
describe('work numbering', () => {
  it('pads the folio to three digits', () => {
    expect(workFolio(1)).toBe('001');
    expect(workFolio(31)).toBe('031');
    expect(workFolio(1234)).toBe('1234');
  });
  it('names a work with the numero sign', () => {
    expect(workNumber(31)).toBe('№ 031');
  });
});
