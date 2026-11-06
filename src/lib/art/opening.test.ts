import { describe, expect, it } from 'vitest';
import { openingExpression } from './opening';

const publishing =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id);

describe('the opening expression', () => {
  it("opens on the visitor's request when the work publishes it", () => {
    expect(openingExpression(publishing('ink', 'light'), 'ink', 'light')).toBe('ink');
    expect(openingExpression(publishing('ink', 'light'), 'light', 'ink')).toBe('light');
    expect(openingExpression(publishing('ink', 'silk'), 'silk', 'ink')).toBe('silk');
  });

  it("otherwise opens on the day's expression, whichever it is", () => {
    expect(openingExpression(publishing('ink', 'light'), undefined, 'light')).toBe('light');
    expect(openingExpression(publishing('ink', 'light'), undefined, 'ink')).toBe('ink');
    expect(openingExpression(publishing('ink', 'light'), 'unpublished', 'light')).toBe('light');
  });

  it('falls back to the twin, and to nothing when neither is published', () => {
    expect(openingExpression(publishing('ink'), undefined, 'light')).toBe('ink');
    expect(openingExpression(publishing('light'), 'ink', 'ink')).toBe('light');
    expect(openingExpression(publishing('silk'), undefined, 'light')).toBeUndefined();
  });
});
