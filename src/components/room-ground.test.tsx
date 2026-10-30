import { afterEach, describe, expect, it } from 'vitest';
import { lendPlateTone, returnPlateTone, setPlateTone } from './room-ground';

const root = () => document.documentElement;
const tone = () => root().style.getPropertyValue('--plate-tone');
const material = () => root().getAttribute('data-plate-material');

afterEach(() => {
  setPlateTone('#efe9dd');
  setPlateTone(null);
});

describe("the running head's tone", () => {
  it('takes a plate tone and returns to the room on null', () => {
    setPlateTone('#efe9dd', 'paper');
    expect(tone()).toBe('#efe9dd');
    expect(material()).toBe('paper');
    setPlateTone(null);
    expect(tone()).toBe('');
    expect(material()).toBeNull();
  });

  it('keeps a lent ground when a plate leaves in the same frame, in either order', () => {
    const orbit = {};
    lendPlateTone(orbit, '#000000', 'night');
    setPlateTone(null);
    expect(material()).toBe('night');
    returnPlateTone(orbit);
    expect(material()).toBeNull();
  });

  it('lets a plate take the head back, after which the lender cannot clear it', () => {
    const orbit = {};
    lendPlateTone(orbit, '#000000', 'night');
    setPlateTone('#efe9dd', 'paper');
    returnPlateTone(orbit);
    expect(tone()).toBe('#efe9dd');
    expect(material()).toBe('paper');
  });

  it('answers only the lender that holds it', () => {
    const orbit = {};
    lendPlateTone(orbit, '#000000', 'night');
    returnPlateTone({});
    expect(material()).toBe('night');
    returnPlateTone(orbit);
    expect(material()).toBeNull();
  });
});
