import { describe, expect, it } from 'vitest';
import { pressedTooSoon, type Press } from './second-press';

describe('a press that comes too soon', () => {
  /** The first press landed here, at one second; the word it brought has stood since 1,016 ms. */
  const first: Press = { x: 600, y: 400, at: 1_000 };
  const came = 1_016;
  const press = (at: number, x = first.x, y = first.y): Press => ({ x, y, at });

  it('is one on what came less than four tenths of a second ago, where the press before its coming landed', () => {
    // The second press of a double click, 3 px off.
    expect(pressedTooSoon(press(1_150, 603), [first], came)).toBe(true);
    expect(pressedTooSoon(press(1_415), [first], came)).toBe(true);
    // At 400 ms on the dot it has stood long enough.
    expect(pressedTooSoon(press(1_416), [first], came)).toBe(false);
  });

  it('is timed from when the word came, not from the press before it', () => {
    // A slow device shows the new word a second after the press that brought it: a tap made
    // 1.2 seconds after that press is still on a word 0.2 seconds old.
    const slow: Press = { ...first, at: 5_000 };
    const shown = 5_000 + 1_000;
    expect(pressedTooSoon(press(5_000 + 1_200), [slow], shown)).toBe(true);
    expect(pressedTooSoon(press(5_000 + 1_500), [slow], shown)).toBe(false);
  });

  it('refuses the third press of three as it refused the second', () => {
    // Tell me pressed three times, 150 ms apart: the way into the record came with the first.
    // The second press, refused, is not what the third is measured against.
    const second = press(1_150);
    expect(pressedTooSoon(second, [first], came)).toBe(true);
    expect(pressedTooSoon(press(1_300), [first, second], came)).toBe(true);
    // A fourth, once the word has stood its four tenths, is taken.
    expect(pressedTooSoon(press(1_450), [first, second, press(1_300)], came)).toBe(false);
  });

  it('takes a press anywhere else at once, across or down', () => {
    // 29 px away is the same word; 30 is another place.
    expect(pressedTooSoon(press(1_100, 629), [first], came)).toBe(true);
    expect(pressedTooSoon(press(1_100, 630), [first], came)).toBe(false);
    // The answers stand over the words: a press 60 px above is not at the same place.
    expect(pressedTooSoon(press(1_100, 600, 340), [first], came)).toBe(false);
    expect(pressedTooSoon(press(1_100, 600, 429), [first], came)).toBe(true);
    expect(pressedTooSoon(press(1_100, 600, 430), [first], came)).toBe(false);
  });

  it('never refuses a first press', () => {
    expect(pressedTooSoon(press(1_100), [], came)).toBe(false);
  });

  it('takes at once a press on what no press in that place went before, however lately it came', () => {
    // An answer is pressed far to the left; Further on appears at 2,000 ms and is pressed
    // three times in its first third of a second, in one place. The press its coming followed
    // landed elsewhere, so every one is the visitor's own.
    const answer: Press = { x: 100, y: 340, at: 1_990 };
    const appeared = 2_000;
    const [one, two, three] = [2_050, 2_150, 2_250].map((at) => press(at));
    expect(pressedTooSoon(one, [answer], appeared)).toBe(false);
    expect(pressedTooSoon(two, [answer, one], appeared)).toBe(false);
    expect(pressedTooSoon(three, [answer, one, two], appeared)).toBe(false);
    // Had the answer been pressed where Further on then appeared, the first of them would wait.
    expect(pressedTooSoon(one, [{ ...first, at: 1_990 }], appeared)).toBe(true);
    // What comes in the very instant of a press came with it, not before it.
    expect(pressedTooSoon(press(1_100), [first], first.at)).toBe(true);
  });
});
