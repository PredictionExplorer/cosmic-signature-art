import { describe, expect, it } from 'vitest';
import { formatCountdown } from './countdown';

describe('the contract countdown', () => {
  it('zero-pads hours, minutes and seconds', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(5)).toBe('00:00:05');
    expect(formatCountdown(65)).toBe('00:01:05');
    expect(formatCountdown(3600)).toBe('01:00:00');
    expect(formatCountdown(47 * 3600 + 59 * 60 + 59)).toBe('47:59:59');
  });

  it('folds days into hours so a seven-day preview is one figure', () => {
    expect(formatCountdown(7 * 24 * 3600)).toBe('168:00:00');
    expect(formatCountdown(2 * 24 * 3600 + 3 * 3600 + 14 * 60 + 9)).toBe('51:14:09');
  });

  it('truncates fractional seconds instead of rounding past the deadline', () => {
    expect(formatCountdown(59.9)).toBe('00:00:59');
    expect(formatCountdown(0.4)).toBe('00:00:00');
  });

  it('renders an exhausted or unreadable clock as 00:00:00', () => {
    expect(formatCountdown(-1)).toBe('00:00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('00:00:00');
    expect(formatCountdown(Number.NEGATIVE_INFINITY)).toBe('00:00:00');
  });
});
