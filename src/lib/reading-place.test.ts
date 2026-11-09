import { describe, expect, it } from 'vitest';
import { placeAt, readPlace, scrollFor } from './reading-place';

describe('the reader’s place', () => {
  it('is the first mark not wholly above the reading line, and how far down it the line falls', () => {
    const boxes = [
      { top: -400, height: 300 },
      { top: -100, height: 200 },
      { top: 100, height: 50 },
    ];
    // The second mark spans the line at 64: a little over four fifths of it lies above.
    expect(placeAt(boxes, 64)).toEqual({ index: 1, share: 164 / 200 });
    // A line between marks rests on the next, at its top.
    expect(placeAt(boxes, 100)).toEqual({ index: 2, share: 0 });
    expect(placeAt([{ top: 200, height: 40 }], 64)).toEqual({ index: 0, share: 0 });
    // Everything above the line: no place.
    expect(placeAt(boxes, 400)).toBeNull();
    expect(placeAt([], 64)).toBeNull();
  });

  it('is put back by scrolling the same share of its mark to the line', () => {
    // The mark is now 900 px below the viewport's top, with the page scrolled 300 px.
    expect(scrollFor({ top: 900, height: 200 }, 0.5, 64, 300)).toBe(300 + 900 + 100 - 64);
    expect(scrollFor({ top: 10, height: 20 }, 0, 64, 0)).toBe(0);
  });

  it('reads back only a place it could have kept', () => {
    const place = { to: '/ja/art/31', id: 'orbit', index: 3, count: 40, share: 0.25 };
    expect(readPlace(JSON.stringify(place))).toEqual(place);
    expect(readPlace(JSON.stringify({ ...place, share: 4 }))?.share).toBe(1);
    for (const broken of [
      null,
      '',
      'not json',
      JSON.stringify({ ...place, to: 'https://elsewhere.example/ja' }),
      JSON.stringify({ ...place, index: 40 }),
      JSON.stringify({ ...place, index: -1 }),
      JSON.stringify({ ...place, count: 'many' }),
      JSON.stringify({ ...place, id: 7 }),
    ])
      expect(readPlace(broken)).toBeNull();
  });
});
